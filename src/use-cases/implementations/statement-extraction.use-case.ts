/**
 * Statement Extraction Use Case Implementation
 * 
 * Coordinates LLM-based extraction of structured statement data from cleaned text.
 * Uses bank-specific prompts and validates the extracted data.
 */

import { 
  IStatementExtractionUseCase,
  StatementExtractionRequest,
  UseCaseResult
} from '../interfaces';
import { ILoggingGateway } from '../gateways/interfaces';
import { LLMGatewayFactory } from '../../adapters/gateways/llm-gateway.factory';

export class StatementExtractionUseCase implements IStatementExtractionUseCase {
  constructor(
    private readonly logger: ILoggingGateway
  ) {}

  async extractStatement(request: StatementExtractionRequest): Promise<UseCaseResult<any>> {
    const startTime = Date.now();

    try {
      // Validate input
      if (!request.cleanedText || request.cleanedText.trim().length === 0) {
        return {
          success: false,
          error: 'Cleaned text cannot be empty',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      if (!request.extractorConfig.apiKey) {
        return {
          success: false,
          error: 'LLM API key is required',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      this.logger.info('Starting statement extraction', {
        textLength: request.cleanedText.length,
        bankType: request.bankType,
        provider: request.extractorConfig.provider,
        model: request.extractorConfig.model
      });

      // Create a gateway instance for this specific request
      const gateway = LLMGatewayFactory.createFromExtractorConfig(request.extractorConfig);

      // Get bank-specific prompt
      const prompt = this.getBankSpecificPrompt(request.bankType);
      const fullPrompt = prompt + "\n\nSTATEMENT TEXT:\n" + request.cleanedText;

      this.logger.debug('Prompt prepared', {
        bankType: request.bankType,
        promptLength: fullPrompt.length,
        estimatedTokens: gateway.estimateTokens(fullPrompt)
      });

      // Extract data using LLM
      const extractionResult = await gateway.extractData({
        prompt: fullPrompt,
        text: request.cleanedText,
        format: 'json',
        schema: this.getExpectedSchema(request.bankType)
      });

      if (!extractionResult.success || !extractionResult.data) {
        return {
          success: false,
          error: `LLM extraction failed: ${extractionResult.error}`,
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      const extractedData = extractionResult.data.extractedData;

      // Validate extracted data structure
      const validation = this.validateExtractedData(extractedData, request.bankType);
      
      if (!validation.isValid) {
        this.logger.warn('Extracted data validation failed', {
          bankType: request.bankType,
          errors: validation.errors,
          warnings: validation.warnings
        });

        // Return error only for critical validation failures
        if (validation.errors.some(error => error.includes('critical'))) {
          return {
            success: false,
            error: `Data validation failed: ${validation.errors.join(', ')}`,
            metadata: { processingTime: Date.now() - startTime }
          };
        }
      }

      // Enrich data with metadata
      const enrichedData = {
        ...extractedData,
        extractionMetadata: {
          processingTime: Date.now() - startTime,
          provider: request.extractorConfig.provider,
          model: extractionResult.data.modelUsed,
          confidence: extractionResult.data.confidence,
          tokensUsed: extractionResult.data.tokensUsed,
          warnings: extractionResult.data.warnings || [],
          validationWarnings: validation.warnings
        }
      };

      this.logger.info('Statement extraction completed successfully', {
        bankType: request.bankType,
        provider: request.extractorConfig.provider,
        model: extractionResult.data.modelUsed,
        confidence: extractionResult.data.confidence,
        transactionCount: extractedData.transactions?.length || 0,
        processingTime: Date.now() - startTime,
        tokensUsed: extractionResult.data.tokensUsed
      });

      return {
        success: true,
        data: enrichedData,
        metadata: {
          processingTime: Date.now() - startTime,
          provider: request.extractorConfig.provider,
          model: extractionResult.data.modelUsed,
          confidence: extractionResult.data.confidence,
          tokensUsed: extractionResult.data.tokensUsed
        }
      };

    } catch (error) {
      this.logger.error('Statement extraction error', {
        error: error instanceof Error ? error.message : error,
        bankType: request.bankType,
        provider: request.extractorConfig.provider
      });

      return {
        success: false,
        error: `Statement extraction failed: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime: Date.now() - startTime }
      };
    }
  }

  private getBankSpecificPrompt(bankType: string): string {
    // Import the enhanced credit card prompt
    const { getCreditCardPrompt } = require('../../prompts/enhanced-credit-card.prompt');
    return getCreditCardPrompt(bankType);
  }

  private getExpectedSchema(bankType: string): any {
    // Define expected schema based on bank type
    const baseSchema = {
      type: 'object',
      required: ['holder', 'accountNumber', 'bank', 'period', 'totals', 'transactions'],
      properties: {
        holder: { type: 'string' },
        accountNumber: { type: 'string' },
        bank: { type: 'string' },
        period: {
          type: 'object',
          required: ['previousClosing', 'previousDueDate', 'currentClosing', 'currentDueDate'],
          properties: {
            previousClosing: { type: 'string', pattern: '\\d{4}-\\d{2}-\\d{2}' },
            previousDueDate: { type: 'string', pattern: '\\d{4}-\\d{2}-\\d{2}' },
            currentClosing: { type: 'string', pattern: '\\d{4}-\\d{2}-\\d{2}' },
            currentDueDate: { type: 'string', pattern: '\\d{4}-\\d{2}-\\d{2}' }
          }
        },
        totals: {
          type: 'object',
          required: ['pesos', 'dollars', 'minimumPayment'],
          properties: {
            pesos: { type: 'number' },
            dollars: { type: 'number' },
            minimumPayment: { type: 'number' }
          }
        },
        transactions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['date', 'merchant', 'amountPesos', 'amountDollars'],
            properties: {
              date: { type: 'string' },
              merchant: { type: 'string' },
              installment: { type: ['string', 'null'] },
              voucher: { type: 'string' },
              amountPesos: { type: 'number' },
              amountDollars: { type: 'number' }
            }
          }
        }
      }
    };

    // Customize schema based on bank
    if (bankType.toLowerCase() === 'pampa') {
      // Pampa has different transaction format
      return {
        ...baseSchema,
        properties: {
          ...baseSchema.properties,
          transactions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['date', 'description', 'amount'],
              properties: {
                date: { type: 'string' },
                description: { type: 'string' },
                amount: { type: 'number' },
                currency: { type: 'string' },
                type: { type: 'string' },
                installments: { type: 'string' },
                reference: { type: 'string' }
              }
            }
          }
        }
      };
    }

    return baseSchema;
  }

  private validateExtractedData(data: any, bankType: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic structure validation
    if (!data || typeof data !== 'object') {
      errors.push('critical: Extracted data must be an object');
      return { isValid: false, errors, warnings };
    }

    // Required fields
    const requiredFields = ['holder', 'accountNumber', 'bank', 'period', 'totals', 'transactions'];
    for (const field of requiredFields) {
      if (!data[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Transactions validation
    if (data.transactions) {
      if (!Array.isArray(data.transactions)) {
        errors.push('Transactions must be an array');
      } else {
        if (data.transactions.length === 0) {
          warnings.push('No transactions found in statement');
        }

        // Validate transaction structure
        data.transactions.forEach((transaction: any, index: number) => {
          if (!transaction.date) {
            errors.push(`Transaction ${index}: Missing date`);
          }
          
          if (bankType.toLowerCase() === 'galicia') {
            if (!transaction.merchant) {
              errors.push(`Transaction ${index}: Missing merchant`);
            }
            if (typeof transaction.amountPesos !== 'number' && typeof transaction.amountDollars !== 'number') {
              errors.push(`Transaction ${index}: Missing amount information`);
            }
          } else if (bankType.toLowerCase() === 'pampa') {
            if (!transaction.description) {
              errors.push(`Transaction ${index}: Missing description`);
            }
            if (typeof transaction.amount !== 'number') {
              errors.push(`Transaction ${index}: Missing amount`);
            }
          }
        });
      }
    }

    // Period validation
    if (data.period) {
      const periodFields = ['previousClosing', 'previousDueDate', 'currentClosing', 'currentDueDate'];
      for (const field of periodFields) {
        if (!data.period[field]) {
          errors.push(`Missing period field: ${field}`);
        } else {
          // Basic date format validation
          if (!/\d{4}-\d{2}-\d{2}/.test(data.period[field])) {
            warnings.push(`Invalid date format in period.${field}: ${data.period[field]}`);
          }
        }
      }
    }

    // Totals validation
    if (data.totals) {
      const totalFields = ['pesos', 'dollars', 'minimumPayment'];
      for (const field of totalFields) {
        if (typeof data.totals[field] !== 'number') {
          warnings.push(`Invalid total field type: ${field} should be a number`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}