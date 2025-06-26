'use server';

/**
 * @fileOverview An AI flow to diagnose issues from Minecraft server logs.
 *
 * - diagnoseLogs - A function that analyzes log content for errors.
 * - DiagnoseLogsInput - The input type for the diagnoseLogs function.
 * - DiagnoseLogsOutput - The return type for the diagnoseLogs function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DiagnoseLogsInputSchema = z.object({
  logs: z.string().describe('The full text content of the server logs to be analyzed.'),
});
export type DiagnoseLogsInput = z.infer<typeof DiagnoseLogsInputSchema>;

const DiagnoseLogsOutputSchema = z.object({
  hasError: z
    .boolean()
    .describe('Whether a critical error was found in the logs.'),
  errorSummary: z
    .string()
    .describe('A brief, one-sentence summary of the main error. If no error, state that the logs look clean.'),
  possibleCause: z
    .string()
    .describe('A detailed but easy-to-understand explanation of the likely root cause of the error. If no error, this can be empty.'),
  suggestedFix: z
    .string()
    .describe('A clear, step-by-step guide on how to resolve the issue. Use markdown for formatting, like lists. If no error, this can be empty.'),
});
export type DiagnoseLogsOutput = z.infer<typeof DiagnoseLogsOutputSchema>;

export async function diagnoseLogs(
  input: DiagnoseLogsInput
): Promise<DiagnoseLogsOutput> {
  return diagnoseLogsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'diagnoseLogsPrompt',
  input: {schema: DiagnoseLogsInputSchema},
  output: {schema: DiagnoseLogsOutputSchema},
  prompt: `You are an expert Minecraft server administrator specializing in diagnosing issues from server logs, especially for PaperMC, Velocity, Forge, and Fabric servers.

Analyze the following server logs provided by the user. Your task is to identify the primary critical error that is causing the server to crash, fail to start, or malfunction. Ignore common, non-critical warnings unless they are directly related to a major failure.

**VERY IMPORTANT FOR MODDED (FABRIC/FORGE) SERVERS:**
Your analysis should prioritize the following common issues in order:

**1. Client-Side Mods on Server:**
A very common crash reason is a client-side only mod being installed on the server.
- Look for errors like \`java.lang.RuntimeException: Cannot load class ... in environment type SERVER\` or errors referencing Minecraft's rendering or client-side packages (e.g., \`net.minecraft.client\`).
- The mod name can usually be found in the stack trace (e.g., "... provided by 'slyde'").
- If you find this, your 'possibleCause' must state that a client-side mod is on the server.
- Your 'suggestedFix' should be to remove that mod's .jar file from the server's 'mods' folder.

**2. Mixin Conflicts:**
Many crashes are caused by "Mixin" errors. Look for keywords like \`MixinApplyError\`, \`MixinTargetAlreadyLoadedException\`, or \`InjectionPoint\`. These almost always indicate a conflict between two or more mods.
- When you see a Mixin error, identify the conflicting mods mentioned in the stack trace. For example, in \`Mixin [modernfix-common.mixins.json: ... ] from mod modernfix\`, the mod is 'modernfix'. The error message may also name another mod that triggered the issue (e.g., "Could not execute entrypoint... provided by 'c2me'").
- Your 'possibleCause' should explain that this is a mod incompatibility issue where two mods are trying to modify the same part of Minecraft's code in a conflicting way.
- Your 'suggestedFix' should provide a clear, step-by-step troubleshooting guide. For example:
   "This is a classic mod conflict. Here's how to troubleshoot it:
    1. **Update Mods:** Ensure all your mods, especially the ones mentioned in the error (like 'modernfix' and 'c2me'), are updated to their latest version compatible with your Minecraft version. This often resolves conflicts.
    2. **Check for Known Issues:** Visit the Modrinth or CurseForge pages for the conflicting mods. The comments or issue trackers often have solutions or workarounds for common conflicts.
    3. **Isolate the Conflict:** If updating doesn't work, temporarily disable one of the mods by renaming its .jar file to .jar.disabled (e.g., remove \`modernfix\` first) and try to start the server. If it starts, you've found the conflict. You may need to choose which mod to keep or find an alternative.
    4. **Configuration:** Some performance mods have configuration files that let you disable specific features. Check the config files for \`c2me\` or \`modernfix\` to see if you can disable the conflicting optimization."

Your analysis should be thorough. Look for other Java exceptions (e.g., NullPointerException), plugin conflicts (e.g., a plugin failing to enable), configuration errors (e.g., invalid port), or world loading failures.

Based on your analysis, provide a concise and clear response in the specified format.

Logs:
\`\`\`
{{{logs}}}
\`\`\`

If you find a critical error:
- set 'hasError' to true.
- 'errorSummary' should be a single sentence summarizing the problem (e.g., "A client-side mod is causing a crash." or "Mod 'c2me' is conflicting with mod 'modernfix'.").
- 'possibleCause' should explain the root cause in simple terms.
- 'suggestedFix' should provide a clear, step-by-step guide to fix it, using markdown formatting.

If you DO NOT find any critical, server-breaking errors:
- set 'hasError' to false.
- 'errorSummary' should be "No critical errors found in the provided logs."
- 'possibleCause' and 'suggestedFix' should be empty strings.`,
});

const diagnoseLogsFlow = ai.defineFlow(
  {
    name: 'diagnoseLogsFlow',
    inputSchema: DiagnoseLogsInputSchema,
    outputSchema: DiagnoseLogsOutputSchema,
  },
  async input => {
    // Check if logs are empty
    if (!input.logs || input.logs.trim().length < 50) {
      return {
        hasError: false,
        errorSummary: "Log content is too short to analyze.",
        possibleCause: "The log file might be empty or the server hasn't produced enough output yet.",
        suggestedFix: "Ensure the server has been started and has generated some log output before running the analysis."
      };
    }

    const {output} = await prompt(input);
    return output!;
  }
);
