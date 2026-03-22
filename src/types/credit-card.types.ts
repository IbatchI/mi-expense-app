/**
 * Credit Card Statement Data Types
 */

export interface CreditCardTransaction {
  /** Transaction date in YYYY-MM-DD format */
  date: string;
  /** Merchant or establishment name */
  merchant: string;
  /** Installment information (e.g., "1/12" or null for single payment) */
  installment: string | null;
  /** Voucher or reference number */
  voucher: string;
  /** Amount in pesos (local currency) */
  amountPesos: number;
  /** Amount in dollars (foreign currency) */
  amountDollars: number;
}

export interface CreditCardPeriod {
  /** Previous closing date in YYYY-MM-DD format */
  previousClosing: string;
  /** Previous due date in YYYY-MM-DD format */
  previousDueDate: string;
  /** Current closing date in YYYY-MM-DD format */
  currentClosing: string;
  /** Current due date in YYYY-MM-DD format */
  currentDueDate: string;
}

export interface CreditCardTotals {
  /** Total balance in pesos */
  pesos: number;
  /** Total balance in dollars */
  dollars: number;
  /** Minimum payment amount */
  minimumPayment: number;
}

export interface CreditCardStatement {
  /** Account holder name */
  holder: string;
  /** Account number */
  accountNumber: string;
  /** Bank or financial institution name */
  bank: string;
  /** Card network type */
  cardType?: string;
  /** Billing period information */
  period: CreditCardPeriod;
  /** Total amounts and balances */
  totals: CreditCardTotals;
  /** List of transactions */
  transactions: CreditCardTransaction[];
}

/**
 * Configuration for PDF extraction
 */
export interface ExtractorConfig {
  /** LLM provider to use */
  provider: 'gemini' | 'github';
  /** API key for the selected provider */
  apiKey: string;
  /** Optional model name override */
  model?: string;
}

/**
 * Result from PDF extraction
 */
export interface ExtractionResult {
  /** Whether the extraction was successful */
  success: boolean;
  /** Extracted data (if successful) */
  data?: CreditCardStatement;
  /** Error message (if failed) */
  error?: string;
  /** Additional metadata */
  metadata?: {
    /** Processing time in milliseconds */
    processingTime: number;
    /** Number of pages processed */
    pageCount: number;
    /** Provider used */
    provider: string;
    /** Model used */
    model: string;
  };
}

/**
 * NEW: Expense categorization interfaces
 */

/** Expense category information */
export interface ExpenseCategory {
  /** Main category name */
  category: string;
  /** Specific tags for this transaction */
  tags: string[];
  /** Classification confidence (0.0-1.0) */
  confidence: number;
}

/** Enhanced transaction with categorization */
export interface CategorizedTransaction {
  // Existing fields (flexible to handle both Galicia and Pampa formats)
  date: string;
  description: string;
  amount?: number;           // Pampa format
  amountPesos?: number;      // Galicia format  
  amountUSD?: number;        // USD transactions
  currency?: string;
  type: "purchase" | "payment" | "fee" | "tax";
  installments?: string;
  reference?: string;
  
  // NEW: Categorization fields
  category: string;
  tags: string[];
  confidence: number;
}

/** Category breakdown summary */
export interface CategoryBreakdown {
  [categoryName: string]: {
    total: number;
    count: number;
    percentage: number;
  };
}

/** Enhanced statement with categorization */
export interface CategorizedStatement {
  // All existing statement fields (flexible structure)
  [key: string]: any;
  
  // Enhanced transactions
  transactions: CategorizedTransaction[];
  
  // NEW: Category summary
  categoryBreakdown: CategoryBreakdown;
  
  // NEW: Classification metadata
  classificationMetadata?: {
    processingTime: number;
    totalTransactions: number;
    categorizedTransactions: number;
    uncategorizedTransactions: number;
  };
}

/** Classification result */
export interface ClassificationResult {
  success: boolean;
  data?: CategorizedStatement;
  error?: string;
  metadata?: {
    processingTime: number;
    provider: string;
    model: string;
  };
}