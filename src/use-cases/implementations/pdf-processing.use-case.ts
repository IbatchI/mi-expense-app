/**
 * PDF Processing Use Case Implementation
 *
 * Handles PDF text extraction from buffer.
 */

import {
  IPDFProcessingUseCase,
  PDFExtractionRequest,
  PDFExtractionResult,
  UseCaseResult,
} from "../interfaces";
import { IPDFProcessorGateway, ILoggingGateway } from "../gateways/interfaces";

export class PDFProcessingUseCase implements IPDFProcessingUseCase {
  constructor(
    private readonly pdfProcessorGateway: IPDFProcessorGateway,
    private readonly logger: ILoggingGateway,
  ) {}

  async extractTextFromPDF(
    request: PDFExtractionRequest,
  ): Promise<UseCaseResult<PDFExtractionResult>> {
    const startTime = Date.now();

    try {
      if (!request.pdfBuffer || request.pdfBuffer.length === 0) {
        return {
          success: false,
          error: "PDF buffer cannot be empty",
          metadata: { processingTime: Date.now() - startTime },
        };
      }

      this.logger.debug("Starting PDF text extraction", {
        bufferSize: request.pdfBuffer.length,
        bankType: request.bankType,
        pageLimit: request.pageLimit,
      });

      const pdfResult = await this.pdfProcessorGateway.parseBuffer(
        request.pdfBuffer,
        request.pageLimit,
      );

      if (!pdfResult.success || !pdfResult.data) {
        return {
          success: false,
          error: `PDF parsing failed: ${pdfResult.error}`,
          metadata: { processingTime: Date.now() - startTime },
        };
      }

      const rawText = pdfResult.data.text;
      const pageCount = pdfResult.data.pageCount;

      this.logger.info("PDF parsing completed", {
        pageCount,
        textLength: rawText.length,
      });

      const result: PDFExtractionResult = {
        rawText,
        pageCount,
        cleanedText: rawText,
        preprocessedData: undefined,
      };

      return {
        success: true,
        data: result,
        metadata: {
          processingTime: Date.now() - startTime,
          preprocessingApplied: false,
        },
      };
    } catch (error) {
      this.logger.error("PDF processing error", {
        error: error instanceof Error ? error.message : error,
        bufferSize: request.pdfBuffer?.length || 0,
      });

      return {
        success: false,
        error: `PDF processing failed: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime: Date.now() - startTime },
      };
    }
  }
}
