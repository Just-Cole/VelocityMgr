"use server";

import {
  getRamRecommendation,
  type GetRamRecommendationInput,
  type GetRamRecommendationOutput,
} from "@/ai/flows/get-ram-recommendation";

export async function getRamSuggestion(
  input: GetRamRecommendationInput
): Promise<GetRamRecommendationOutput | { error: string }> {
  try {
    const result = await getRamRecommendation(input);
    return result;
  } catch (error) {
    console.error("Error getting RAM suggestion:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return { error: `Failed to get RAM suggestion: ${errorMessage}.` };
  }
}
