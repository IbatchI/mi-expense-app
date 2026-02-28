/**
 * LLM Extraction Gateway Implementation
 *
 * Wraps the existing Gemini and GitHub extractors in the gateway interface.
 * Provides a unified interface for different LLM providers.
 */

import {
  ILLMExtractionGateway,
  GatewayResult,
  LLMConfig,
  LLMExtractionRequest,
  LLMExtractionResult,
} from "../../use-cases/gateways/interfaces";

export class LLMExtractionGateway implements ILLMExtractionGateway {
  private extractor: any;

  constructor(private readonly config: LLMConfig) {
    this.initializeExtractor();
  }

  async extractData(
    request: LLMExtractionRequest,
  ): Promise<GatewayResult<LLMExtractionResult>> {
    const startTime = Date.now();

    try {
      if (!this.extractor) {
        return {
          success: false,
          error: "LLM extractor not initialized",
          metadata: { processingTime: Date.now() - startTime },
        };
      }

      // Validate request
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

      // Use the extractor's extractData method directly
      let extractedData: any;

      if (request.format === "json") {
        // For JSON format, use the full prompt directly
        extractedData = await this.extractor.extractData(request.prompt);
      } else {
        // For other formats, combine prompt and text
        const fullPrompt = `${request.prompt}\n\n${request.text}`;
        extractedData = await this.extractor.extractData(fullPrompt);
      }

      // Estimate confidence based on data structure completeness
      const confidence = this.estimateConfidence(extractedData);

      const result: LLMExtractionResult = {
        extractedData,
        confidence,
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
      // Create a temporary extractor instance for testing
      const testExtractor = this.createExtractor(config);

      // Test with a simple prompt
      const testResult = await testExtractor.extractData(
        "Test connection. Respond with: {'status': 'connected'}",
      );

      // Check if we got any response
      return testResult !== null && testResult !== undefined;
    } catch (error) {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    // Return available models based on provider
    switch (this.config.provider) {
      case "gemini":
        return ["gemini-3-flash-preview"];
      case "github":
        return ["gpt-4", "gpt-3.5-turbo", "gpt-4-turbo"];
      default:
        return [];
    }
  }

  estimateTokens(text: string): number {
    // Simple token estimation (roughly 4 characters per token for most languages)
    return Math.ceil(text.length / 4);
  }

  private initializeExtractor(): void {
    try {
      this.extractor = this.createExtractor(this.config);
    } catch (error) {
      throw new Error(
        `Failed to initialize ${this.config.provider} extractor: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private createExtractor(config: LLMConfig): any {
    const extractorConfig = {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
    };

    if (config.provider === "gemini") {
      const { GeminiExtractor } = require("../../extractors/gemini.extractor");
      return new GeminiExtractor(extractorConfig);
    } else if (config.provider === "github") {
      const { GitHubExtractor } = require("../../extractors/github.extractor");
      return new GitHubExtractor(extractorConfig);
    } else {
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }

  private getDefaultModel(): string {
    switch (this.config.provider) {
      case "gemini":
        return "gemini-3-flash-preview";
      case "github":
        return "gpt-4";
      default:
        return "unknown";
    }
  }

  private estimateConfidence(data: any): number {
    if (!data || typeof data !== "object") {
      return 0.1; // Very low confidence for non-object responses
    }

    let score = 0.5; // Base score for valid object

    // Check for required fields
    const requiredFields = [
      "holder",
      "accountNumber",
      "bank",
      "period",
      "totals",
      "transactions",
    ];
    const presentFields = requiredFields.filter(
      (field) => data[field] !== undefined,
    );

    score += (presentFields.length / requiredFields.length) * 0.3;

    // Check transaction data quality
    if (data.transactions && Array.isArray(data.transactions)) {
      if (data.transactions.length > 0) {
        score += 0.1;

        // Check first transaction for completeness
        const firstTx = data.transactions[0];
        if (
          firstTx &&
          firstTx.date &&
          firstTx.merchant &&
          (firstTx.amountPesos || firstTx.amount)
        ) {
          score += 0.1;
        }
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

    // Check for missing required fields
    const requiredFields = [
      "holder",
      "accountNumber",
      "bank",
      "period",
      "totals",
      "transactions",
    ];
    for (const field of requiredFields) {
      if (!data[field]) {
        warnings.push(`Missing required field: ${field}`);
      }
    }

    // Check transactions array
    if (!data.transactions || !Array.isArray(data.transactions)) {
      warnings.push("Transactions field must be an array");
    } else if (data.transactions.length === 0) {
      warnings.push("No transactions found in extracted data");
    } else {
      // Check transaction structure
      const incompleteTransactions = data.transactions.filter(
        (tx: any, index: number) => {
          if (!tx.date) {
            warnings.push(`Transaction ${index + 1}: Missing date`);
            return true;
          }
          if (!tx.merchant && !tx.description) {
            warnings.push(
              `Transaction ${index + 1}: Missing merchant/description`,
            );
            return true;
          }
          if (!tx.amountPesos && !tx.amount && !tx.amountDollars) {
            warnings.push(
              `Transaction ${index + 1}: Missing amount information`,
            );
            return true;
          }
          return false;
        },
      );

      if (incompleteTransactions.length > 0) {
        warnings.push(
          `${incompleteTransactions.length} transactions have missing required fields`,
        );
      }
    }

    // Check period structure
    if (data.period) {
      const periodFields = [
        "previousClosing",
        "previousDueDate",
        "currentClosing",
        "currentDueDate",
      ];
      const missingPeriodFields = periodFields.filter(
        (field) => !data.period[field],
      );
      if (missingPeriodFields.length > 0) {
        warnings.push(
          `Missing period fields: ${missingPeriodFields.join(", ")}`,
        );
      }
    }

    return warnings;
  }
}
