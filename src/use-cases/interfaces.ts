/**
 * Use Case Interfaces and Common Types
 * 
 * Defines the contracts for all business use cases in the application.
 * These interfaces represent the application's business rules and orchestrate
 * the flow of data to and from domain entities.
 */

// Common result types for use cases
export interface UseCaseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    processingTime: number;
    [key: string]: any;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Bank detection types
export interface BankDetectionRequest {
  pdfText: string;
}

export interface BankDetectionResult {
  bank: string;
  confidence: number;
  patterns: string[];
}

// PDF extraction types
export interface PDFExtractionRequest {
  pdfBuffer: Buffer;
  bankType: string;
  pageLimit?: number;
}

export interface PDFExtractionResult {
  rawText: string;
  pageCount: number;
  cleanedText: string;
  preprocessedData?: any;
}

// Statement extraction types
export interface StatementExtractionRequest {
  cleanedText: string;
  bankType: string;
  extractorConfig: {
    provider: 'gemini' | 'github';
    apiKey: string;
    model?: string;
  };
}

// Expense categorization types
export interface ExpenseCategorializationRequest {
  statementData: any;
  extractorConfig: {
    provider: 'gemini' | 'github';
    apiKey: string;
    model?: string;
  };
}

// File processing types
export interface FileProcessingRequest {
  filePath: string;
  outputPath?: string;
  extractorConfig: {
    provider: 'gemini' | 'github';
    apiKey: string;
    model?: string;
  };
}

/**
 * Bank Detection Use Case Interface
 */
export interface IBankDetectionUseCase {
  detectBank(request: BankDetectionRequest): Promise<UseCaseResult<BankDetectionResult>>;
}

/**
 * PDF Processing Use Case Interface  
 */
export interface IPDFProcessingUseCase {
  extractTextFromPDF(request: PDFExtractionRequest): Promise<UseCaseResult<PDFExtractionResult>>;
}

/**
 * Statement Extraction Use Case Interface
 */
export interface IStatementExtractionUseCase {
  extractStatement(request: StatementExtractionRequest): Promise<UseCaseResult<any>>;
}

/**
 * Expense Categorization Use Case Interface
 */
export interface IExpenseCategorializationUseCase {
  categorizeExpenses(request: ExpenseCategorializationRequest): Promise<UseCaseResult<any>>;
}

/**
 * Complete File Processing Use Case Interface
 * This orchestrates the entire pipeline from PDF to categorized statement
 */
export interface ICompleteFileProcessingUseCase {
  processFile(request: FileProcessingRequest): Promise<UseCaseResult<any>>;
}

/**
 * LLM Connection Testing Use Case Interface
 */
export interface ILLMConnectionTestUseCase {
  testConnection(extractorConfig: StatementExtractionRequest['extractorConfig']): Promise<boolean>;
}

/**
 * Statement Validation Use Case Interface
 */
export interface IStatementValidationUseCase {
  validateStatement(statementData: any): ValidationResult;
  validateTransactionData(transactions: any[]): ValidationResult;
}