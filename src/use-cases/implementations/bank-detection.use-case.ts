/**
 * Bank Detection Use Case Implementation
 * 
 * Analyzes PDF text to identify the bank and confidence level.
 * Uses pattern matching and statistical analysis to determine the source bank.
 */

import { 
  IBankDetectionUseCase,
  BankDetectionRequest,
  BankDetectionResult,
  UseCaseResult
} from '../interfaces';
import { IBankDetectionGateway, ILoggingGateway } from '../gateways/interfaces';

export class BankDetectionUseCase implements IBankDetectionUseCase {
  constructor(
    private readonly bankDetectionGateway: IBankDetectionGateway,
    private readonly logger: ILoggingGateway
  ) {}

  async detectBank(request: BankDetectionRequest): Promise<UseCaseResult<BankDetectionResult>> {
    const startTime = Date.now();

    try {
      // Validate input
      if (!request.pdfText || request.pdfText.trim().length === 0) {
        return {
          success: false,
          error: 'PDF text cannot be empty',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      // Log detection attempt
      this.logger.debug('Starting bank detection', {
        textLength: request.pdfText.length,
        textPreview: request.pdfText.substring(0, 200) + '...'
      });

      // Use gateway to detect bank
      const gatewayResult = await this.bankDetectionGateway.detectBank(request.pdfText);

      if (!gatewayResult.success || !gatewayResult.data) {
        return {
          success: false,
          error: gatewayResult.error || 'Bank detection failed',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      const detectionResult = gatewayResult.data;

      // Validate detection result
      if (!detectionResult.bank || detectionResult.confidence < 0 || detectionResult.confidence > 1) {
        return {
          success: false,
          error: 'Invalid bank detection result',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      // Log successful detection
      this.logger.info('Bank detection completed', {
        bank: detectionResult.bank,
        confidence: detectionResult.confidence,
        patternsMatched: detectionResult.patterns.length,
        processingTime: Date.now() - startTime
      });

      // Provide recommendations for low confidence
      if (detectionResult.confidence < 0.5) {
        this.logger.warn('Low confidence bank detection', {
          bank: detectionResult.bank,
          confidence: detectionResult.confidence,
          recommendation: 'Manual verification recommended'
        });
      }

      return {
        success: true,
        data: detectionResult,
        metadata: { 
          processingTime: Date.now() - startTime,
          supportedBanks: this.bankDetectionGateway.getSupportedBanks()
        }
      };

    } catch (error) {
      this.logger.error('Bank detection error', {
        error: error instanceof Error ? error.message : error,
        textLength: request.pdfText?.length || 0
      });

      return {
        success: false,
        error: `Bank detection failed: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime: Date.now() - startTime }
      };
    }
  }
}