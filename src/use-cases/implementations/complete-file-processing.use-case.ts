/**
 * Complete File Processing Use Case
 * 
 * This is the main orchestrating use case that handles the entire pipeline
 * from PDF upload to categorized expense statement. It coordinates all the
 * individual use cases to provide a complete processing workflow.
 */

import { 
  ICompleteFileProcessingUseCase,
  FileProcessingRequest,
  UseCaseResult
} from '../interfaces';
import {
  IBankDetectionUseCase,
  IPDFProcessingUseCase,
  IStatementExtractionUseCase,
  IExpenseCategorializationUseCase,
  ILLMConnectionTestUseCase
} from '../interfaces';
import { ILoggingGateway } from '../gateways/interfaces';
import { ExpenseStatement } from '../../domain/entities/expense-statement.entity';
import { IStatementRepository } from '../repositories/interfaces';

export class CompleteFileProcessingUseCase implements ICompleteFileProcessingUseCase {
  constructor(
    private readonly bankDetectionUseCase: IBankDetectionUseCase,
    private readonly pdfProcessingUseCase: IPDFProcessingUseCase,
    private readonly statementExtractionUseCase: IStatementExtractionUseCase,
    private readonly expenseCategorializationUseCase: IExpenseCategorializationUseCase,
    private readonly llmConnectionTestUseCase: ILLMConnectionTestUseCase,
    private readonly statementRepository: IStatementRepository,
    private readonly logger: ILoggingGateway
  ) {}

  async processFile(request: FileProcessingRequest): Promise<UseCaseResult<{
    statement: ExpenseStatement;
    processingDetails: {
      bankDetection: any;
      extraction: any;
      categorization: any;
    };
  }>> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    try {
      this.logger.info('Starting complete file processing', {
        requestId,
        filePath: request.filePath,
        provider: request.extractorConfig.provider
      });

      // STEP 1: Extract text from PDF
      this.logger.info('Step 1: Extracting text from PDF', { requestId });
      const pdfResult = await this.pdfProcessingUseCase.extractTextFromPDF({
        pdfBuffer: await this.loadPDFBuffer(request.filePath),
        bankType: 'unknown' // Will be determined in next step
      });

      if (!pdfResult.success || !pdfResult.data) {
        return {
          success: false,
          error: `PDF processing failed: ${pdfResult.error}`,
          metadata: { processingTime: Date.now() - startTime, requestId }
        };
      }

      this.logger.info('PDF processing completed', {
        requestId,
        pageCount: pdfResult.data.pageCount,
        textLength: pdfResult.data.rawText.length
      });

      // STEP 2: Detect bank
      this.logger.info('Step 2: Detecting bank', { requestId });
      const bankDetectionResult = await this.bankDetectionUseCase.detectBank({
        pdfText: pdfResult.data.rawText
      });

      if (!bankDetectionResult.success || !bankDetectionResult.data) {
        return {
          success: false,
          error: `Bank detection failed: ${bankDetectionResult.error}`,
          metadata: { processingTime: Date.now() - startTime, requestId }
        };
      }

      const bankInfo = bankDetectionResult.data;
      this.logger.info('Bank detection completed', {
        requestId,
        bank: bankInfo.bank,
        confidence: bankInfo.confidence
      });

      // Warn if low confidence
      if (bankInfo.confidence < 0.8) {
        this.logger.warn('Low confidence bank detection', {
          requestId,
          bank: bankInfo.bank,
          confidence: bankInfo.confidence
        });
      }

      // STEP 3: Test LLM connection
      this.logger.info('Step 3: Testing LLM connection', { requestId });
      const connectionTest = await this.llmConnectionTestUseCase.testConnection(request.extractorConfig);
      
      if (!connectionTest) {
        return {
          success: false,
          error: 'LLM connection test failed',
          metadata: { processingTime: Date.now() - startTime, requestId }
        };
      }

      this.logger.info('LLM connection test successful', { requestId });

      // STEP 4: Extract statement data
      this.logger.info('Step 4: Extracting statement data', { requestId });
      const extractionResult = await this.statementExtractionUseCase.extractStatement({
        cleanedText: pdfResult.data.cleanedText,
        bankType: bankInfo.bank,
        extractorConfig: request.extractorConfig
      });

      if (!extractionResult.success || !extractionResult.data) {
        return {
          success: false,
          error: `Statement extraction failed: ${extractionResult.error}`,
          metadata: { processingTime: Date.now() - startTime, requestId }
        };
      }

      this.logger.info('Statement extraction completed', {
        requestId,
        transactionCount: extractionResult.data.transactions?.length || 0
      });

      // STEP 5: Categorize expenses
      this.logger.info('Step 5: Categorizing expenses', { requestId });
      const categorizationResult = await this.expenseCategorializationUseCase.categorizeExpenses({
        statementData: extractionResult.data,
        extractorConfig: request.extractorConfig
      });

      if (!categorizationResult.success || !categorizationResult.data) {
        this.logger.warn('Expense categorization failed, continuing with uncategorized data', {
          requestId,
          error: categorizationResult.error
        });
        // Continue with uncategorized data
      } else {
        this.logger.info('Expense categorization completed', {
          requestId,
          categorizedCount: categorizationResult.data.transactions?.length || 0
        });
      }

      // STEP 6: Create domain entity
      this.logger.info('Step 6: Creating expense statement entity', { requestId });
      const finalData = categorizationResult.success && categorizationResult.data 
        ? categorizationResult.data 
        : extractionResult.data;

      let statement: ExpenseStatement;
      try {
        if (finalData.categoryBreakdown) {
          statement = ExpenseStatement.fromCategorizedStatement(finalData);
        } else {
          statement = ExpenseStatement.fromCreditCardStatement(finalData);
        }
      } catch (error) {
        return {
          success: false,
          error: `Failed to create expense statement: ${error instanceof Error ? error.message : error}`,
          metadata: { processingTime: Date.now() - startTime, requestId }
        };
      }

      // STEP 7: Save to repository
      this.logger.info('Step 7: Saving statement to repository', { requestId });
      const saveResult = await this.statementRepository.save(statement);
      
      if (!saveResult.success) {
        this.logger.warn('Failed to save statement to repository', {
          requestId,
          error: saveResult.error
        });
        // Continue - saving is not critical for the main workflow
      } else {
        this.logger.info('Statement saved successfully', {
          requestId,
          statementId: saveResult.data
        });
      }

      // STEP 8: Save intermediate files if requested
      if (request.outputPath) {
        await this.saveIntermediateFiles(request.outputPath, {
          rawText: pdfResult.data.rawText,
          cleanedText: pdfResult.data.cleanedText,
          bankDetection: bankInfo,
          extractedData: extractionResult.data,
          finalStatement: statement.toFrontendFormat()
        });
      }

      const processingTime = Date.now() - startTime;
      
      this.logger.info('Complete file processing finished successfully', {
        requestId,
        processingTime,
        statementId: statement.id,
        bank: bankInfo.bank,
        transactionCount: statement.transactions.length
      });

      return {
        success: true,
        data: {
          statement,
          processingDetails: {
            bankDetection: bankInfo,
            extraction: extractionResult.metadata,
            categorization: categorizationResult.metadata
          }
        },
        metadata: {
          processingTime,
          requestId,
          bankDetectionConfidence: bankInfo.confidence,
          extractionProvider: request.extractorConfig.provider
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('Unexpected error in file processing', {
        requestId,
        error: error instanceof Error ? error.message : error,
        processingTime
      });

      return {
        success: false,
        error: `Unexpected error: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime, requestId }
      };
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private async loadPDFBuffer(filePath: string): Promise<Buffer> {
    const fs = require('fs');
    return fs.readFileSync(filePath);
  }

  private async saveIntermediateFiles(outputPath: string, data: any): Promise<void> {
    const fs = require('fs');
    const path = require('path');
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save different intermediate files
    const baseName = path.basename(outputPath, path.extname(outputPath));
    const baseDir = path.dirname(outputPath);

    await Promise.all([
      fs.promises.writeFile(path.join(baseDir, `${baseName}_raw_text.txt`), data.rawText),
      fs.promises.writeFile(path.join(baseDir, `${baseName}_cleaned_text.txt`), data.cleanedText),
      fs.promises.writeFile(path.join(baseDir, `${baseName}_bank_detection.json`), JSON.stringify(data.bankDetection, null, 2)),
      fs.promises.writeFile(path.join(baseDir, `${baseName}_extracted_data.json`), JSON.stringify(data.extractedData, null, 2)),
      fs.promises.writeFile(outputPath, JSON.stringify(data.finalStatement, null, 2))
    ]);
  }
}