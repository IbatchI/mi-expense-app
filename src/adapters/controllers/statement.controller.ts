/**
 * Statement Controller
 * 
 * Handles HTTP requests for expense statement processing.
 * Coordinates request validation, use case execution, and response formatting.
 */

import { ICompleteFileProcessingUseCase } from '../../use-cases/interfaces';
import { ProcessingResultPresenter, ProcessingStep } from '../presenters/statement.presenter';

// Define minimal request/response interfaces to avoid Express dependency issues for now
export interface HttpRequest {
  body: any;
  params: { [key: string]: string };
}

export interface HttpResponse {
  status(code: number): HttpResponse;
  json(data: any): void;
}

export interface StatementProcessingRequest {
  pdfData: string; // Base64 encoded PDF
  extractorConfig: {
    provider: 'gemini' | 'github';
    apiKey: string;
    model?: string;
  };
}

export class StatementController {
  constructor(
    private completeFileProcessingUseCase: ICompleteFileProcessingUseCase
  ) {}

  /**
   * Process PDF statement upload
   */
  async processStatement(req: HttpRequest, res: HttpResponse): Promise<void> {
    const startTime = Date.now();
    const processingSteps: ProcessingStep[] = [];

    try {
      // Validate request
      const validationResult = this.validateRequest(req.body);
      if (!validationResult.isValid) {
        res.status(400).json({
          success: false,
          error: 'Invalid request format',
          details: validationResult.errors
        });
        return;
      }

      const { pdfData, extractorConfig } = req.body as StatementProcessingRequest;

      // Convert base64 to buffer and create temporary file
      const pdfBuffer = Buffer.from(pdfData, 'base64');
      
      // Validate file size (1MB limit)
      if (pdfBuffer.length > 1024 * 1024) {
        res.status(413).json({
          success: false,
          error: 'PDF file too large. Maximum size is 1MB.'
        });
        return;
      }

      // Create temporary file path for processing
      const tempFilePath = `/tmp/statement_${Date.now()}.pdf`;
      
      // Write buffer to temporary file
      const fs = require('fs').promises;
      await fs.writeFile(tempFilePath, pdfBuffer);

      processingSteps.push({
        name: 'File Upload',
        status: 'success',
        duration: Date.now() - startTime,
        details: `PDF uploaded successfully (${(pdfBuffer.length / 1024).toFixed(1)} KB)`
      });

      // Process the file using the complete file processing use case
      const processingStart = Date.now();
      const result = await this.completeFileProcessingUseCase.processFile({
        filePath: tempFilePath,
        extractorConfig
      });

      processingSteps.push({
        name: 'Statement Processing',
        status: result.success ? 'success' : 'error',
        duration: Date.now() - processingStart,
        details: result.success ? 
          'Statement processed and categorized successfully' : 
          result.error || 'Processing failed'
      });

      // Clean up temporary file
      try {
        await fs.unlink(tempFilePath);
      } catch (error) {
        // Ignore cleanup errors
        console.warn('Failed to cleanup temporary file:', error);
      }

      // Present the result for frontend consumption
      const presentedResult = ProcessingResultPresenter.present(result, processingSteps);

      if (result.success) {
        res.status(200).json(presentedResult);
      } else {
        res.status(422).json(presentedResult);
      }

    } catch (error) {
      console.error('Statement processing error:', error);
      
      const errorStep: ProcessingStep = {
        name: 'Error Handler',
        status: 'error',
        duration: Date.now() - startTime,
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      processingSteps.push(errorStep);

      const errorResult = ProcessingResultPresenter.present({
        success: false,
        error: 'An unexpected error occurred while processing the statement'
      }, processingSteps);

      res.status(500).json(errorResult);
    }
  }

  /**
   * Get processing status for a file
   * (Placeholder for future async processing)
   */
  async getProcessingStatus(req: HttpRequest, res: HttpResponse): Promise<void> {
    const { processingId } = req.params;
    
    // For now, return a simple response indicating synchronous processing
    res.status(200).json({
      processingId,
      status: 'completed',
      message: 'Processing is currently synchronous. Use the /process endpoint for immediate results.'
    });
  }

  /**
   * Validate statement processing request
   */
  private validateRequest(body: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for required fields
    if (!body) {
      errors.push('Request body is required');
      return { isValid: false, errors };
    }

    if (!body.pdfData) {
      errors.push('pdfData is required');
    } else if (typeof body.pdfData !== 'string') {
      errors.push('pdfData must be a base64 encoded string');
    } else {
      // Basic base64 validation
      try {
        const buffer = Buffer.from(body.pdfData, 'base64');
        if (buffer.toString('base64') !== body.pdfData) {
          errors.push('pdfData must be valid base64');
        }
      } catch (error) {
        errors.push('pdfData must be valid base64');
      }
    }

    if (!body.extractorConfig) {
      errors.push('extractorConfig is required');
    } else {
      const config = body.extractorConfig;
      
      if (!config.provider) {
        errors.push('extractorConfig.provider is required');
      } else if (!['gemini', 'github'].includes(config.provider)) {
        errors.push('extractorConfig.provider must be either "gemini" or "github"');
      }

      if (!config.apiKey) {
        errors.push('extractorConfig.apiKey is required');
      } else if (typeof config.apiKey !== 'string') {
        errors.push('extractorConfig.apiKey must be a string');
      }

      if (config.model && typeof config.model !== 'string') {
        errors.push('extractorConfig.model must be a string if provided');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}