/**
 * Gateway Interfaces for External Services
 * 
 * These interfaces define contracts for communicating with external services
 * like LLM providers, PDF processors, and bank detection systems.
 * They isolate the use cases from external service implementation details.
 */

// Common gateway result types
export interface GatewayResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    processingTime: number;
    provider?: string;
    model?: string;
    [key: string]: any;
  };
}

// LLM Provider configuration
export interface LLMConfig {
  provider: 'gemini' | 'github';
  apiKey: string;
  model?: string;
  timeout?: number;
  maxRetries?: number;
}

// PDF processing interfaces
export interface PDFParseResult {
  text: string;
  pageCount: number;
  metadata?: {
    title?: string;
    author?: string;
    creationDate?: string;
    [key: string]: any;
  };
}

export interface IPDFProcessorGateway {
  parseFile(filePath: string, pageLimit?: number): Promise<GatewayResult<PDFParseResult>>;
  parseBuffer(buffer: Buffer, pageLimit?: number): Promise<GatewayResult<PDFParseResult>>;
  extractMetadata(filePath: string): Promise<GatewayResult<any>>;
}

// Bank detection interfaces
export interface BankDetectionPattern {
  bank: string;
  patterns: string[];
  confidence: number;
}

export interface IBankDetectionGateway {
  detectBank(text: string): Promise<GatewayResult<{
    bank: string;
    confidence: number;
    patterns: string[];
  }>>;
  getSupportedBanks(): string[];
  addCustomPattern(bank: string, patterns: string[]): void;
}


// LLM extraction interfaces
export interface LLMExtractionRequest {
  prompt: string;
  text: string;
  format: 'json' | 'structured';
  schema?: any;
}

export interface LLMExtractionResult {
  extractedData: any;
  confidence: number;
  tokensUsed?: number;
  modelUsed: string;
  warnings?: string[];
}

export interface ILLMExtractionGateway {
  extractData(request: LLMExtractionRequest): Promise<GatewayResult<LLMExtractionResult>>;
  testConnection(config: LLMConfig): Promise<boolean>;
  getAvailableModels(): Promise<string[]>;
  estimateTokens(text: string): number;
}

// Expense classification interfaces
export interface ClassificationRequest {
  transactions: any[];
  categories: Array<{
    name: string;
    tags: string[];
    description?: string;
  }>;
  options?: {
    confidenceThreshold?: number;
    allowMultipleCategories?: boolean;
    includeReasons?: boolean;
  };
}

export interface ClassificationResult {
  categorizedTransactions: Array<{
    transaction: any;
    category: string;
    confidence: number;
    tags: string[];
    reasoning?: string;
  }>;
  uncategorizedTransactions: any[];
  categoryBreakdown: {
    [categoryName: string]: {
      count: number;
      totalAmount: number;
      averageConfidence: number;
    };
  };
}

export interface IExpenseClassificationGateway {
  classifyExpenses(request: ClassificationRequest): Promise<GatewayResult<ClassificationResult>>;
  suggestCategories(transactionDescription: string): Promise<GatewayResult<Array<{
    category: string;
    confidence: number;
    reasoning: string;
  }>>>;
  updateCategoryModel(feedback: Array<{
    transaction: any;
    expectedCategory: string;
    actualCategory: string;
    confidence: number;
  }>): Promise<GatewayResult<void>>;
}

// File storage interfaces (for different environments)
export interface FileStorageConfig {
  type: 'local' | 's3' | 'memory';
  region?: string;
  bucket?: string;
  accessKey?: string;
  secretKey?: string;
  localPath?: string;
}

export interface IFileStorageGateway {
  uploadFile(key: string, content: Buffer | string, metadata?: any): Promise<GatewayResult<string>>;
  downloadFile(key: string): Promise<GatewayResult<Buffer>>;
  deleteFile(key: string): Promise<GatewayResult<void>>;
  fileExists(key: string): Promise<boolean>;
  listFiles(prefix?: string): Promise<GatewayResult<string[]>>;
  getFileMetadata(key: string): Promise<GatewayResult<any>>;
  generateSignedUrl(key: string, expirationMinutes: number): Promise<GatewayResult<string>>;
}

// Notification interfaces (for alerts, reports, etc.)
export interface NotificationMessage {
  recipient: string;
  subject: string;
  body: string;
  priority: 'low' | 'medium' | 'high';
  attachments?: Array<{
    filename: string;
    content: Buffer;
    mimeType: string;
  }>;
}

export interface INotificationGateway {
  sendEmail(message: NotificationMessage): Promise<GatewayResult<void>>;
  sendSMS(recipient: string, message: string): Promise<GatewayResult<void>>;
  sendWebhook(url: string, payload: any): Promise<GatewayResult<void>>;
}

// Web search interface
export interface IWebSearchGateway {
  search(query: string, options?: { timeoutMs?: number }): Promise<string>;
}

// Logging and monitoring interfaces
export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: any;
  requestId?: string;
  userId?: string;
}

export interface ILoggingGateway {
  log(entry: LogEntry): Promise<void>;
  debug(message: string, context?: any): Promise<void>;
  info(message: string, context?: any): Promise<void>;
  warn(message: string, context?: any): Promise<void>;
  error(message: string, context?: any): Promise<void>;
  flush(): Promise<void>;
}

export interface MetricData {
  name: string;
  value: number;
  unit: string;
  tags?: Record<string, string>;
  timestamp?: Date;
}

export interface IMonitoringGateway {
  recordMetric(metric: MetricData): Promise<void>;
  recordProcessingTime(operation: string, durationMs: number): Promise<void>;
  recordError(operation: string, error: Error): Promise<void>;
  recordBusinessMetric(name: string, value: number, tags?: Record<string, string>): Promise<void>;
}

// Combined gateway interface for DI convenience
export interface IGateways {
  pdfProcessor: IPDFProcessorGateway;
  bankDetection: IBankDetectionGateway;
  llmExtraction: ILLMExtractionGateway;
  expenseClassification: IExpenseClassificationGateway;
  fileStorage: IFileStorageGateway;
  notification: INotificationGateway;
  logging: ILoggingGateway;
  monitoring: IMonitoringGateway;
}

// Gateway factory interface
export interface IGatewayFactory {
  createPDFProcessorGateway(): IPDFProcessorGateway;
  createBankDetectionGateway(): IBankDetectionGateway;
  createLLMExtractionGateway(config: LLMConfig): ILLMExtractionGateway;
  createExpenseClassificationGateway(config: LLMConfig): IExpenseClassificationGateway;
  createFileStorageGateway(config: FileStorageConfig): IFileStorageGateway;
  createNotificationGateway(): INotificationGateway;
  createLoggingGateway(): ILoggingGateway;
  createMonitoringGateway(): IMonitoringGateway;
  createGateways(config: any): IGateways;
}