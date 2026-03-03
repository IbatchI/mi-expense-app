import { GoogleGenerativeAI } from "@google/generative-ai";
import { BaseExtractor } from "./base.extractor";
import {
  CreditCardStatement,
  ExtractorConfig,
} from "../types/credit-card.types";

/**
 * Gemini-based PDF data extractor
 */
export class GeminiExtractor extends BaseExtractor {
  private genAI: GoogleGenerativeAI;
  private modelName: string;

  constructor(config: ExtractorConfig) {
    super(config);

    if (!config.apiKey) {
      throw new Error("Gemini API key is required");
    }

    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.modelName = config.model || "gemini-3-flash-preview";
  }

  /**
   * Extract data using Gemini AI
   */
  protected async extractData(prompt: string): Promise<CreditCardStatement> {
    try {
      console.log(`🤖 Using Gemini model: ${this.modelName}`);

      const model = this.genAI.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          temperature: 0,
          topP: 1,
          maxOutputTokens: 16384,
        },
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        throw new Error("Empty response from Gemini");
      }

      console.log("✅ Received response from Gemini");

      // Parse and validate JSON response
      const extractedData = this.cleanJsonResponse(text);

      // Log extraction statistics
      this.logStats(extractedData);

      return extractedData;
    } catch (error) {
      if (error instanceof Error) {
        // Handle specific Gemini errors
        if (error.message.includes("API_KEY")) {
          throw new Error(
            "Invalid Gemini API key. Get one at: https://makersuite.google.com/app/apikey",
          );
        }
        if (error.message.includes("SAFETY")) {
          throw new Error(
            "Content blocked by Gemini safety filters. Try a different PDF or contact support.",
          );
        }
        if (error.message.includes("QUOTA_EXCEEDED")) {
          throw new Error(
            "Gemini API quota exceeded. Please try again later or upgrade your plan.",
          );
        }
        if (error.message.includes("MODEL_NOT_FOUND")) {
          throw new Error(
            `Gemini model '${this.modelName}' not found. Try 'gemini-3-flash-preview'.`,
          );
        }
      }

      throw new Error(
        `Gemini extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Test connection to Gemini API
   */
  async testConnection(): Promise<boolean> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      const result = await model.generateContent('Hello, respond with "OK"');
      const response = await result.response;
      const text = response.text();

      return text.includes("OK");
    } catch (error) {
      console.error("Gemini connection test failed:", error);
      return false;
    }
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return [
      "gemini-3-flash-preview", // Fast and efficient
    ];
  }
}
