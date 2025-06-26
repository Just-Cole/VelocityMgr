"use server";

import {
  suggestOptimizedConfigurations,
  type SuggestOptimizedConfigurationsInput,
  type SuggestOptimizedConfigurationsOutput,
} from "@/ai/flows/suggest-optimized-configurations";
import { z } from "zod";

const InputSchema = z.object({
  requirements: z.string().min(10, "Requirements must be at least 10 characters long."),
});

export async function getAIConfigSuggestions(
  input: SuggestOptimizedConfigurationsInput
): Promise<SuggestOptimizedConfigurationsOutput | { error: string }> {
  try {
    const validatedInput = InputSchema.safeParse(input);
    if (!validatedInput.success) {
      return { error: validatedInput.error.errors.map(e => e.message).join(", ") };
    }

    const result = await suggestOptimizedConfigurations(validatedInput.data);
    return result;
  } catch (error) {
    console.error("Error getting AI config suggestions:", error);
    // Check if error is an instance of Error to safely access message property
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return { error: `Failed to get suggestions from AI: ${errorMessage}. Please try again.` };
  }
}
