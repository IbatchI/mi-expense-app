/**
 * PDF Processing Use Case Implementation
 * 
 * Handles PDF text extraction and preprocessing with bank-specific rules.
 */

import { 
  IPDFProcessingUseCase,
  PDFExtractionRequest,
  PDFExtractionResult,
  UseCaseResult
} from '../interfaces';
import { 
  IPDFProcessorGateway, 
  ITextPreprocessorGateway,
  ILoggingGateway 
} from '../gateways/interfaces';

export class PDFProcessingUseCase implements IPDFProcessingUseCase {
  constructor(
    private readonly pdfProcessorGateway: IPDFProcessorGateway,
    private readonly textPreprocessorGateway: ITextPreprocessorGateway,
    private readonly logger: ILoggingGateway
  ) {}

  async extractTextFromPDF(request: PDFExtractionRequest): Promise<UseCaseResult<PDFExtractionResult>> {
    const startTime = Date.now();

    try {
      // Validate input
      if (!request.pdfBuffer || request.pdfBuffer.length === 0) {
        return {
          success: false,
          error: 'PDF buffer cannot be empty',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      this.logger.debug('Starting PDF text extraction', {
        bufferSize: request.pdfBuffer.length,
        bankType: request.bankType
      });

      // Extract raw text from PDF
      const pdfResult = await this.pdfProcessorGateway.parseBuffer(request.pdfBuffer);

      if (!pdfResult.success || !pdfResult.data) {
        return {
          success: false,
          error: `PDF parsing failed: ${pdfResult.error}`,
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      const rawText = pdfResult.data.text;
      const pageCount = pdfResult.data.pageCount;

      this.logger.info('PDF parsing completed', {
        pageCount,
        textLength: rawText.length,
        hasMetadata: !!pdfResult.data.metadata
      });

      // Validate text quality
      const qualityCheck = this.textPreprocessorGateway.validateTextQuality(rawText);
      
      if (!qualityCheck.success || qualityCheck.data?.quality === 'low') {
        this.logger.warn('Low quality PDF text detected', {
          quality: qualityCheck.data?.quality,
          issues: qualityCheck.data?.issues,
          suggestions: qualityCheck.data?.suggestions
        });
      }

      // Apply preprocessing if bank type is known
      let cleanedText = rawText;
      let preprocessedData: any = undefined;

      if (request.bankType && request.bankType !== 'unknown') {
        this.logger.debug('Applying bank-specific preprocessing', {
          bankType: request.bankType
        });

        const preprocessingResult = await this.textPreprocessorGateway.preprocess(rawText, request.bankType);

        if (preprocessingResult.success && preprocessingResult.data) {
          cleanedText = preprocessingResult.data.cleanedText;
          preprocessedData = preprocessingResult.data.extractedData;

          this.logger.info('Preprocessing completed', {
            bankType: request.bankType,
            rulesApplied: preprocessingResult.data.appliedRules.length,
            sectionsRemoved: preprocessingResult.data.removedSections.length,
            cleanedTextLength: cleanedText.length
          });
        } else {
          this.logger.warn('Preprocessing failed, using raw text', {
            bankType: request.bankType,
            error: preprocessingResult.error
          });
        }
      } else {
        this.logger.debug('No bank-specific preprocessing applied (unknown bank type)');
      }

      const result: PDFExtractionResult = {
        rawText,
        pageCount,
        cleanedText,
        preprocessedData
      };

      return {
        success: true,
        data: result,
        metadata: { 
          processingTime: Date.now() - startTime,
          textQuality: qualityCheck.data?.quality,
          preprocessingApplied: !!preprocessedData
        }
      };

    } catch (error) {
      this.logger.error('PDF processing error', {
        error: error instanceof Error ? error.message : error,
        bufferSize: request.pdfBuffer?.length || 0
      });

      return {
        success: false,
        error: `PDF processing failed: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime: Date.now() - startTime }
      };
    }
  }
}