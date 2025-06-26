"use server";

import {
  diagnoseLogs,
  type DiagnoseLogsOutput,
} from "@/ai/flows/diagnose-server-logs";
import { z } from "zod";

const InputSchema = z.object({
  serverId: z.string().uuid("Invalid server ID."),
});

// This is the function the frontend will call
export async function analyzeServerLogs(
  input: { serverId: string }
): Promise<DiagnoseLogsOutput | { error: string }> {
  try {
    const validatedInput = InputSchema.safeParse(input);
    if (!validatedInput.success) {
      return { error: validatedInput.error.errors.map(e => e.message).join(", ") };
    }
    
    const backendPort = process.env.BACKEND_PORT || 3005;
    const apiUrl = `http://localhost:${backendPort}/api`;

    // Fetch the full log content from the backend API
    const logResponse = await fetch(`${apiUrl}/minecraft/servers/${validatedInput.data.serverId}/console/full-log`);
    
    if (!logResponse.ok) {
        try {
            const errorData = await logResponse.json();
            throw new Error(errorData.message || `Failed to fetch logs. Status: ${logResponse.status}`);
        } catch(e) {
            throw new Error(`Failed to fetch logs. Status: ${logResponse.status} - ${await logResponse.text()}`);
        }
    }
    const logContent = await logResponse.text();

    const result = await diagnoseLogs({ logs: logContent });
    return result;

  } catch (error) {
    console.error("Error analyzing server logs:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return { error: `Failed to get AI diagnosis: ${errorMessage}` };
  }
}
