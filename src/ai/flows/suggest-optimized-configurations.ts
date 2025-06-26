'use server';

/**
 * @fileOverview Suggests optimized game server configurations based on user requirements.
 *
 * - suggestOptimizedConfigurations - A function that suggests optimized configurations.
 * - SuggestOptimizedConfigurationsInput - The input type for the suggestOptimizedConfigurations function.
 * - SuggestOptimizedConfigurationsOutput - The return type for the suggestOptimizedConfigurations function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestOptimizedConfigurationsInputSchema = z.object({
  requirements: z
    .string()
    .describe(
      'The requirements for the game server and its backend instances, including desired functionalities and performance expectations.'
    ),
});
export type SuggestOptimizedConfigurationsInput = z.infer<
  typeof SuggestOptimizedConfigurationsInputSchema
>;

const SuggestOptimizedConfigurationsOutputSchema = z.object({
  mainServerConfiguration: z
    .string()
    .describe('The suggested optimized main server configuration (e.g., Velocity).'),
  backendInstanceConfiguration: z
    .string()
    .describe('The suggested optimized backend instance configuration (e.g., PaperMC).'),
  pluginRecommendations: z
    .string()
    .describe('The recommended plugins for both the main server and backend instances.'),
});
export type SuggestOptimizedConfigurationsOutput = z.infer<
  typeof SuggestOptimizedConfigurationsOutputSchema
>;

export async function suggestOptimizedConfigurations(
  input: SuggestOptimizedConfigurationsInput
): Promise<SuggestOptimizedConfigurationsOutput> {
  return suggestOptimizedConfigurationsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestOptimizedConfigurationsPrompt',
  input: {schema: SuggestOptimizedConfigurationsInputSchema},
  output: {schema: SuggestOptimizedConfigurationsOutputSchema},
  prompt: `You are an expert in optimizing game server (e.g., Velocity-based) and backend instance (e.g., PaperMC-based) configurations.

  Based on the following requirements, suggest optimized configurations for both the main server and backend instances, including plugin recommendations.

  Requirements: {{{requirements}}}

  Consider factors like performance, security, and desired functionalities when making your suggestions.
  Return the response in a JSON format.
  Main Server Configuration:
  Backend Instance Configuration:
  Plugin Recommendations:`,
});

const suggestOptimizedConfigurationsFlow = ai.defineFlow(
  {
    name: 'suggestOptimizedConfigurationsFlow',
    inputSchema: SuggestOptimizedConfigurationsInputSchema,
    outputSchema: SuggestOptimizedConfigurationsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
