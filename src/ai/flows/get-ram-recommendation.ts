
'use server';

/**
 * @fileOverview Suggests RAM allocation for a game server based on a description.
 *
 * - getRamRecommendation - A function that suggests min and max RAM.
 * - GetRamRecommendationInput - The input type for the function.
 * - GetRamRecommendationOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GetRamRecommendationInputSchema = z.object({
  modpackName: z.string().describe('The name of the modpack.'),
  modpackDescription: z.string().describe('The description of the modpack.'),
});
export type GetRamRecommendationInput = z.infer<typeof GetRamRecommendationInputSchema>;

const GetRamRecommendationOutputSchema = z.object({
  minRam: z.string().describe("The suggested minimum RAM, in Megabytes with an 'M' suffix. E.g., '4096M' or '512M'."),
  maxRam: z.string().describe("The suggested maximum RAM, in Megabytes with an 'M' suffix. E.g., '8192M' or '1024M'."),
});
export type GetRamRecommendationOutput = z.infer<typeof GetRamRecommendationOutputSchema>;

export async function getRamRecommendation(
  input: GetRamRecommendationInput
): Promise<GetRamRecommendationOutput> {
  return getRamRecommendationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'getRamRecommendationPrompt',
  input: {schema: GetRamRecommendationInputSchema},
  output: {schema: GetRamRecommendationOutputSchema},
  prompt: `You are an expert in Minecraft server hosting. Analyze the following modpack name and description to recommend a minimum and maximum RAM allocation.
  
  Modpack Name: {{{modpackName}}}
  Description: {{{modpackDescription}}}

  Consider the number of mods, the complexity, and common knowledge about the pack if available.
  - For light packs (less than 50 mods), suggest around 2048M-4096M.
  - For medium packs (50-150 mods), suggest around 4096M-6144M.
  - For heavy packs (150+ mods, or kitchen-sink packs), suggest 6144M-8192M or even 8192M-10240M.
  
  Return your answer in the format specified. The values MUST be in Megabytes, ending with 'M'. For example: '4096M', '6144M', '8192M'.
  `,
});

const getRamRecommendationFlow = ai.defineFlow(
  {
    name: 'getRamRecommendationFlow',
    inputSchema: GetRamRecommendationInputSchema,
    outputSchema: GetRamRecommendationOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
