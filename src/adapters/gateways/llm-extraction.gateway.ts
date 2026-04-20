/**
 * LLM Extraction Gateway Implementation
 *
 * Talks directly to Gemini and GitHub Models APIs.
 * No dependency on legacy extractor classes.
 */

import {
  ILLMExtractionGateway,
  GatewayResult,
  LLMConfig,
  LLMExtractionRequest,
  LLMExtractionResult,
} from "../../use-cases/gateways/interfaces";

export class LLMExtractionGateway implements ILLMExtractionGateway {
  constructor(private readonly config: LLMConfig) {}

  async extractData(
    request: LLMExtractionRequest,
  ): Promise<GatewayResult<LLMExtractionResult>> {
    const startTime = Date.now();

    if (!request.prompt || request.prompt.trim().length === 0) {
      return {
        success: false,
        error: "Prompt cannot be empty",
        metadata: { processingTime: Date.now() - startTime },
      };
    }

    if (!request.text || request.text.trim().length === 0) {
      return {
        success: false,
        error: "Text to extract from cannot be empty",
        metadata: { processingTime: Date.now() - startTime },
      };
    }

    try {
      const fullPrompt =
        request.format === "json"
          ? request.prompt
          : `${request.prompt}\n\n${request.text}`;

      const rawResponse = await this.callLLM(fullPrompt);
      const extractedData = this.parseJsonResponse(rawResponse);

      const result: LLMExtractionResult = {
        extractedData,
        confidence: this.estimateConfidence(extractedData),
        modelUsed: this.config.model || this.getDefaultModel(),
        tokensUsed: this.estimateTokens(request.prompt + request.text),
        warnings: this.validateExtractedData(extractedData),
      };

      return {
        success: true,
        data: result,
        metadata: {
          processingTime: Date.now() - startTime,
          provider: this.config.provider,
          model: result.modelUsed,
          promptLength: request.prompt.length,
          textLength: request.text.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `LLM extraction failed: ${error instanceof Error ? error.message : error}`,
        metadata: {
          processingTime: Date.now() - startTime,
          provider: this.config.provider,
        },
      };
    }
  }

  async testConnection(config: LLMConfig): Promise<boolean> {
    try {
      const gateway = new LLMExtractionGateway(config);
      const response = await gateway.callLLM('Hello, respond with "OK"');
      return response.includes("OK");
    } catch (error) {
      console.error("   ❌ testConnection error:", error instanceof Error ? error.message : error);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    switch (this.config.provider) {
      case "gemini":
        return ["gemini-3-flash-preview"];
      case "github":
        return ["gpt-4o", "gpt-4o-mini", "gpt-4", "gpt-3.5-turbo"];
      default:
        return [];
    }
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // Exposed for ExpenseClassificationGateway to reuse
  async callLLM(prompt: string): Promise<string> {
    if (this.config.provider === "gemini") {
      return this.callGemini(prompt);
    } else if (this.config.provider === "github") {
      return this.callGitHubModels(prompt);
    } else {
      throw new Error(`Unsupported LLM provider: ${this.config.provider}`);
    }
  }

  private async callGemini(prompt: string): Promise<string> {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");

    if (!this.config.apiKey) {
      throw new Error("Gemini API key is required");
    }

    const modelName = this.config.model || "gemini-3-flash-preview";
    console.log(`🤖 Using Gemini model: ${modelName}`);

    const genAI = new GoogleGenerativeAI(this.config.apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
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
    return text;
  }

  private async callGitHubModels(prompt: string): Promise<string> {
    const fetch = (await import("node-fetch")).default;

    if (!this.config.apiKey) {
      throw new Error("GitHub token is required");
    }

    const modelName = this.config.model || "gpt-4o";
    const baseUrl = "https://models.inference.ai.azure.com";
    console.log(`🤖 Using GitHub Models: ${modelName}`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        model: modelName,
        temperature: 0,
        max_completion_tokens: 8192,
        top_p: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) throw new Error("Invalid GitHub token.");
      if (response.status === 403) throw new Error("GitHub Copilot Pro subscription required.");
      if (response.status === 429) throw new Error("Rate limit exceeded. Try again later.");
      throw new Error(`GitHub Models API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as any;

    if (!data.choices || data.choices.length === 0) {
      throw new Error("No response choices returned from GitHub Models");
    }

    const content = data.choices[0].message.content;
    if (!content || content.trim().length === 0) {
      throw new Error("Empty response from GitHub Models");
    }

    console.log("✅ Received response from GitHub Models");
    return content;
  }

  private parseJsonResponse(text: string): any {
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*$/g, "")
      .trim();

    // Try to find the JSON object/array in the response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("No JSON found in LLM response");
    }

    return JSON.parse(jsonMatch[0]);
  }

  private getDefaultModel(): string {
    switch (this.config.provider) {
      case "gemini":
        return "gemini-3-flash-preview";
      case "github":
        return "gpt-4o";
      default:
        return "unknown";
    }
  }

  private estimateConfidence(data: any): number {
    if (!data || typeof data !== "object") return 0.1;

    let score = 0.5;
    const requiredFields = ["holder", "accountNumber", "bank", "period", "totals", "transactions"];
    const presentFields = requiredFields.filter((f) => data[f] !== undefined);
    score += (presentFields.length / requiredFields.length) * 0.3;

    if (Array.isArray(data.transactions) && data.transactions.length > 0) {
      score += 0.1;
      const first = data.transactions[0];
      if (first?.date && (first?.description || first?.merchant) && (first?.amountPesos || first?.amountDollars)) {
        score += 0.1;
      }
    }

    return Math.min(score, 1.0);
  }

  private validateExtractedData(data: any): string[] {
    const warnings: string[] = [];

    if (!data || typeof data !== "object") {
      warnings.push("Extracted data is not a valid object");
      return warnings;
    }

    const requiredFields = ["holder", "accountNumber", "bank", "period", "totals", "transactions"];
    for (const field of requiredFields) {
      if (!data[field]) warnings.push(`Missing required field: ${field}`);
    }

    if (!Array.isArray(data.transactions)) {
      warnings.push("Transactions field must be an array");
    } else if (data.transactions.length === 0) {
      warnings.push("No transactions found in extracted data");
    } else {
      data.transactions.forEach((tx: any, i: number) => {
        if (!tx.date) warnings.push(`Transaction ${i + 1}: Missing date`);
        if (!tx.description && !tx.merchant) warnings.push(`Transaction ${i + 1}: Missing description`);
        if (!tx.amountPesos && !tx.amountDollars) warnings.push(`Transaction ${i + 1}: Missing amount`);
      });
    }

    return warnings;
  }
}
