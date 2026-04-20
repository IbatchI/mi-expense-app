import { StatementPeriod } from '../value-objects/statement-period.vo';
import { Money } from '../value-objects/money.vo';
import { ConfidenceScore } from '../value-objects/confidence-score.vo';
import { Transaction } from './transaction.entity';
import { Category } from './category.entity';

/**
 * Statement Totals interface
 */
export interface StatementTotals {
  pesos: Money;
  dollars: Money;
  minimumPayment: Money;
}

/**
 * Category Breakdown for expense analysis
 */
export interface CategoryBreakdown {
  [categoryName: string]: {
    total: Money;
    count: number;
    percentage: number;
    averageAmount: Money;
  };
}

/**
 * Statement Processing Metadata
 */
export interface ProcessingMetadata {
  processingTime: number;
  provider: string;
  model: string;
  pageCount: number;
  totalTransactions: number;
  categorizedTransactions: number;
  uncategorizedTransactions: number;
  extractionSuccess: boolean;
  classificationSuccess: boolean;
}

/**
 * ExpenseStatement Domain Entity
 * 
 * Represents a complete credit card statement with transactions, categorization,
 * and business rules for expense analysis and financial management.
 */
export type CardNetworkType = 'visa' | 'mc';

export class ExpenseStatement {
  private constructor(
    private readonly _id: string,
    private readonly _holder: string,
    private readonly _accountNumber: string,
    private readonly _bank: string,
    private readonly _cardType: CardNetworkType,
    private readonly _period: StatementPeriod,
    private readonly _totals: StatementTotals,
    private readonly _transactions: readonly Transaction[],
    private readonly _categoryBreakdown?: CategoryBreakdown,
    private readonly _metadata?: ProcessingMetadata
  ) {
    this.validateStatement();
  }

  /**
   * Creates a new ExpenseStatement with validation
   */
  static create(params: {
    id: string;
    holder: string;
    accountNumber: string;
    bank: string;
    cardType: CardNetworkType;
    period: StatementPeriod;
    totals: StatementTotals;
    transactions: Transaction[];
    categoryBreakdown?: CategoryBreakdown;
    metadata?: ProcessingMetadata;
  }): ExpenseStatement {
    return new ExpenseStatement(
      params.id,
      params.holder,
      params.accountNumber,
      params.bank,
      params.cardType,
      params.period,
      params.totals,
      [...params.transactions],
      params.categoryBreakdown,
      params.metadata
    );
  }

  /**
   * Normalizes a raw card type string to 'visa' | 'mc'.
   * Falls back to text-based detection using the PDF raw text if provided.
   */
  private static normalizeCardType(rawCardType: string | undefined, pdfText?: string): CardNetworkType {
    const normalize = (value: string): CardNetworkType | null => {
      const lower = value.toLowerCase();
      if (lower.includes('visa')) return 'visa';
      if (lower.includes('mastercard') || lower.includes('master card') || lower === 'mc') return 'mc';
      return null;
    };

    if (rawCardType) {
      const fromRaw = normalize(rawCardType);
      if (fromRaw) return fromRaw;
    }

    if (pdfText) {
      // Galicia VISA: statement numbers begin with "VI"
      if (/Resumen\s+N[°º]\s+VI\d+/i.test(pdfText)) return 'visa';
      // Galicia Mastercard: statement numbers begin with "MC"
      if (/Resumen\s+N[°º]\s+MC\d+/i.test(pdfText)) return 'mc';
      // Generic keyword fallback
      const fromText = normalize(pdfText.slice(0, 2000));
      if (fromText) return fromText;
    }

    // Default to visa — most common for supported banks
    return 'visa';
  }

  /**
   * Creates an ExpenseStatement from the existing CreditCardStatement format
   */
  static fromCreditCardStatement(statement: any, pdfText?: string): ExpenseStatement {
    if (!statement.period) {
      throw new Error(
        `Cannot create statement: period data is missing for bank "${statement.bank || 'unknown'}". ` +
        `This usually means bank detection failed or the LLM did not extract the closing/due dates correctly.`
      );
    }
    if (!statement.totals) {
      throw new Error(
        `Cannot create statement: totals data is missing for bank "${statement.bank || 'unknown'}". ` +
        `This usually means the LLM did not extract the balance or minimum payment correctly.`
      );
    }

    const id = this.generateStatementId(statement.bank, statement.accountNumber, statement.period.currentClosing);
    
    // Convert period
    const period = StatementPeriod.fromDates(
      statement.period.previousClosing,
      statement.period.previousDueDate,
      statement.period.currentClosing,
      statement.period.currentDueDate
    );

    // Convert totals
    const totals: StatementTotals = {
      pesos: Money.pesos(statement.totals.pesos),
      dollars: Money.dollars(statement.totals.dollars),
      minimumPayment: Money.pesos(statement.totals.minimumPayment)
    };

    // Convert transactions based on bank format
    const transactions = this.convertTransactions(statement.transactions, statement.bank);

    const cardType = this.normalizeCardType(statement.cardType, pdfText);

    return new ExpenseStatement(
      id,
      statement.holder,
      statement.accountNumber,
      statement.bank,
      cardType,
      period,
      totals,
      transactions
    );
  }

  /**
   * Creates an ExpenseStatement with categorized transactions
   */
  static fromCategorizedStatement(statement: any, pdfText?: string): ExpenseStatement {
    const baseStatement = this.fromCreditCardStatement(statement, pdfText);
    
    // Process categorized transactions
    const categorizedTransactions = statement.transactions.map((tx: any) => {
      // Find base transaction
      // Match by date + amount. For USD transactions (amountDollars > 0), compare against
      // the USD amount; for ARS transactions compare against amountPesos (or generic amount).
      const txAmount = tx.amountDollars > 0
        ? tx.amountDollars
        : (tx.amount || tx.amountPesos || 0);
      const baseTransaction = baseStatement.transactions.find(t => 
        t.getDateString() === tx.date && 
        Math.abs(t.amount.getValue() - txAmount) < 0.01
      );

      if (!baseTransaction) {
        throw new Error(`Could not find matching base transaction for categorized transaction`);
      }

      // Add category if available
      if (tx.category && tx.confidence) {
        const category = Category.fromSpanishCategory(
          tx.category,
          tx.category, // English name same as Spanish for now
          tx.tags || [],
          'shopping-bag', // Default icon
          '#6366F1' // Default color
        );
        
        // Convert confidence number to ConfidenceScore value object
        const confidenceScore = ConfidenceScore.create(tx.confidence);
        return baseTransaction.categorize(category, confidenceScore);
      }

      return baseTransaction;
    });

    // Calculate category breakdown
    const categoryBreakdown = this.calculateCategoryBreakdown(categorizedTransactions);

    // Add metadata if available
    const metadata: ProcessingMetadata | undefined = statement.classificationMetadata ? {
      processingTime: statement.classificationMetadata.processingTime,
      provider: statement.classificationMetadata.provider || 'unknown',
      model: statement.classificationMetadata.model || 'unknown',
      pageCount: statement.classificationMetadata.pageCount || 1,
      totalTransactions: statement.classificationMetadata.totalTransactions,
      categorizedTransactions: statement.classificationMetadata.categorizedTransactions,
      uncategorizedTransactions: statement.classificationMetadata.uncategorizedTransactions,
      extractionSuccess: true,
      classificationSuccess: true
    } : undefined;

    return new ExpenseStatement(
      baseStatement._id,
      baseStatement._holder,
      baseStatement._accountNumber,
      baseStatement._bank,
      baseStatement._cardType,
      baseStatement._period,
      baseStatement._totals,
      categorizedTransactions,
      categoryBreakdown,
      metadata
    );
  }

  private static generateStatementId(bank: string, accountNumber: string, closingDate: string): string {
    const normalizedBank = bank.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedAccount = accountNumber.replace(/[^a-z0-9]/gi, '');
    const normalizedDate = closingDate.replace(/[^\d]/g, '');
    
    return `${normalizedBank}_${normalizedAccount}_${normalizedDate}`;
  }

  private static convertTransactions(transactions: any[], _bank: string): Transaction[] {
    return transactions.map((tx, index) => {
      try {
        // Unified format: all prompts now return description, amountPesos, amountDollars, installments, reference
        const amountPesos = tx.amountPesos ?? tx.amount ?? 0;
        const amountDollars = tx.amountDollars ?? 0;
        const currency = amountDollars > 0 ? 'USD' : 'ARS';
        const amount = currency === 'USD' ? amountDollars : amountPesos;

        return Transaction.fromPampaFormat({
          date: tx.date,
          description: tx.description || tx.merchant || '',
          amount,
          currency,
          type: tx.type,
          installments: tx.installments ?? tx.installment ?? null,
          reference: tx.reference || tx.voucher || null
        });
      } catch (error) {
        throw new Error(`Failed to convert transaction ${index}: ${error instanceof Error ? error.message : error}`);
      }
    });
  }

  private static calculateCategoryBreakdown(transactions: readonly Transaction[]): CategoryBreakdown {
    const breakdown: { [categoryName: string]: { total: number; count: number; currency: string; } } = {};
    
    // Calculate totals by category - include both expenses and discounts, exclude payments
    const categorizedTransactions = transactions.filter(tx => 
      tx.isCategorized() && (tx.isExpense() || tx.isDiscount())
    );
    const totalAmount = categorizedTransactions.reduce((sum, tx) => sum + tx.amount.getValue(), 0);

    for (const transaction of categorizedTransactions) {
      if (!transaction.category) continue;

      const categoryName = transaction.category.name;
      const amount = transaction.amount.getValue();
      const currency = transaction.amount.getCurrency();

      if (!breakdown[categoryName]) {
        breakdown[categoryName] = {
          total: 0,
          count: 0,
          currency: currency
        };
      }

      // Only add amounts of the same currency
      if (breakdown[categoryName].currency === currency) {
        breakdown[categoryName].total += amount;
        breakdown[categoryName].count += 1;
      }
    }

    // Convert to final format with Money objects and percentages
    const result: CategoryBreakdown = {};
    for (const [categoryName, data] of Object.entries(breakdown)) {
      const percentage = totalAmount > 0 ? (data.total / totalAmount) * 100 : 0;
      const avgAmount = data.count > 0 ? data.total / data.count : 0;
      
      result[categoryName] = {
        total: Money.create(data.total, data.currency as any),
        count: data.count,
        percentage: percentage,
        averageAmount: Money.create(avgAmount, data.currency as any)
      };
    }

    return result;
  }

  private validateStatement(): void {
    if (!this._id || this._id.trim().length === 0) {
      throw new Error('Statement ID cannot be empty');
    }

    if (!this._holder || this._holder.trim().length === 0) {
      throw new Error('Statement holder cannot be empty');
    }

    if (!this._accountNumber || this._accountNumber.trim().length === 0) {
      throw new Error('Account number cannot be empty');
    }

    if (!this._bank || this._bank.trim().length === 0) {
      throw new Error('Bank cannot be empty');
    }

    if (this._transactions.length === 0) {
      throw new Error('Statement must have at least one transaction');
    }

    // Validate that all transactions fall within the statement period
    for (const transaction of this._transactions) {
      if (!this._period.isDateInCurrentPeriod(transaction.date)) {
        console.warn(`Transaction ${transaction.id} falls outside statement period`);
      }
    }
  }

  // Getters
  get id(): string {
    return this._id;
  }

  get holder(): string {
    return this._holder;
  }

  get accountNumber(): string {
    return this._accountNumber;
  }

  get bank(): string {
    return this._bank;
  }

  get cardType(): CardNetworkType {
    return this._cardType;
  }

  get period(): StatementPeriod {
    return this._period;
  }

  get totals(): StatementTotals {
    return {
      pesos: this._totals.pesos,
      dollars: this._totals.dollars,
      minimumPayment: this._totals.minimumPayment
    };
  }

  get transactions(): readonly Transaction[] {
    return [...this._transactions];
  }

  get categoryBreakdown(): CategoryBreakdown | undefined {
    if (!this._categoryBreakdown) return undefined;
    
    // Deep copy the breakdown to maintain immutability
    const copy: CategoryBreakdown = {};
    for (const [key, value] of Object.entries(this._categoryBreakdown)) {
      copy[key] = {
        total: value.total,
        count: value.count,
        percentage: value.percentage,
        averageAmount: value.averageAmount
      };
    }
    return copy;
  }

  get metadata(): ProcessingMetadata | undefined {
    return this._metadata ? { ...this._metadata } : undefined;
  }

  /**
   * Returns only the transactions that are expenses (excluding payments, refunds, and bank-applied discounts)
   */
  getExpenseTransactions(): readonly Transaction[] {
    return this._transactions.filter(tx => tx.isExpense() && !tx.excludeFromTotal);
  }

  /**
   * Returns only categorized transactions
   */
  getCategorizedTransactions(): readonly Transaction[] {
    return this._transactions.filter(tx => tx.isCategorized());
  }

  /**
   * Returns uncategorized transactions
   */
  getUncategorizedTransactions(): readonly Transaction[] {
    return this._transactions.filter(tx => !tx.isCategorized() && tx.isExpense());
  }

  /**
   * Gets transactions for a specific category
   */
  getTransactionsByCategory(categoryName: string): readonly Transaction[] {
    return this._transactions.filter(tx => 
      tx.category && tx.category.name === categoryName
    );
  }

  /**
   * Calculates total expenses (excluding payments, fees, etc.)
   */
  getTotalExpenses(): Money {
    const expenseTransactions = this.getExpenseTransactions();
    
    // Group by currency
    let totalPesos = 0;
    let totalUSD = 0;

    for (const transaction of expenseTransactions) {
      if (transaction.amount.getCurrency() === 'ARS') {
        totalPesos += transaction.amount.getValue();
      } else if (transaction.amount.getCurrency() === 'USD') {
        totalUSD += transaction.amount.getValue();
      }
    }

    // Return the larger amount as primary
    return totalPesos >= totalUSD ? Money.pesos(totalPesos) : Money.dollars(totalUSD);
  }

  /**
   * Returns total expenses split by currency (ARS and USD separately)
   */
  getTotalExpensesByCurrency(): { pesos: Money; dollars: Money } {
    const expenseTransactions = this.getExpenseTransactions();

    let totalPesos = 0;
    let totalUSD = 0;

    for (const transaction of expenseTransactions) {
      if (transaction.amount.getCurrency() === 'ARS') {
        totalPesos += transaction.amount.getValue();
      } else if (transaction.amount.getCurrency() === 'USD') {
        totalUSD += transaction.amount.getValue();
      }
    }

    return {
      pesos: Money.pesos(totalPesos),
      dollars: Money.dollars(totalUSD),
    };
  }

  /**
   * Gets categorization statistics
   */
  getCategorizationStats(): {
    totalTransactions: number;
    expenseTransactions: number;
    categorizedTransactions: number;
    uncategorizedTransactions: number;
    categorizationPercentage: number;
    totalCategories: number;
  } {
    const expenseTransactions = this.getExpenseTransactions();
    const categorizedTransactions = this.getCategorizedTransactions();
    const uncategorizedTransactions = this.getUncategorizedTransactions();

    return {
      totalTransactions: this._transactions.length,
      expenseTransactions: expenseTransactions.length,
      categorizedTransactions: categorizedTransactions.length,
      uncategorizedTransactions: uncategorizedTransactions.length,
      categorizationPercentage: expenseTransactions.length > 0
        ? (categorizedTransactions.filter(t => t.isExpense()).length / expenseTransactions.length) * 100
        : 0,
      totalCategories: this._categoryBreakdown ? Object.keys(this._categoryBreakdown).length : 0
    };
  }

  /**
   * Checks if the statement payment is overdue
   */
  isOverdue(referenceDate: Date = new Date()): boolean {
    return this._period.isOverdue(referenceDate);
  }

  /**
   * Gets days remaining until due date
   */
  getDaysUntilDue(referenceDate: Date = new Date()): number {
    return this._period.getDaysUntilDue(referenceDate);
  }

  /**
   * Converts to frontend-friendly format optimized for React apps
   */
  toFrontendFormat(): {
    id: string;
    holder: string;
    accountNumber: string;
    bank: string;
    cardType: CardNetworkType;
    period: {
      previousClosing: string;
      previousDueDate: string;
      currentClosing: string;
      currentDueDate: string;
      periodLength: number;
      daysUntilDue: number;
      isOverdue: boolean;
    };
    totals: {
      pesos: { amount: number; formatted: string; };
      dollars: { amount: number; formatted: string; };
      minimumPayment: { amount: number; formatted: string; };
    };
    transactions: any[];
    categoryBreakdown?: {
      [categoryName: string]: {
        total: { amount: number; formatted: string; currency: string; };
        count: number;
        percentage: number;
        averageAmount: { amount: number; formatted: string; currency: string; };
      };
    };
    stats: {
      totalTransactions: number;
      expenseTransactions: number;
      categorizedTransactions: number;
      uncategorizedTransactions: number;
      categorizationPercentage: number;
      totalCategories: number;
    };
    metadata?: ProcessingMetadata;
  } {
    const periodDates = this._period.toDateStrings();
    
    // Convert category breakdown for frontend
    let frontendCategoryBreakdown: any = undefined;
    if (this._categoryBreakdown) {
      frontendCategoryBreakdown = {};
      for (const [categoryName, breakdown] of Object.entries(this._categoryBreakdown)) {
        frontendCategoryBreakdown[categoryName] = {
          total: {
            amount: breakdown.total.getValue(),
            formatted: breakdown.total.format(),
            currency: breakdown.total.getCurrency()
          },
          count: breakdown.count,
          percentage: breakdown.percentage,
          averageAmount: {
            amount: breakdown.averageAmount.getValue(),
            formatted: breakdown.averageAmount.format(),
            currency: breakdown.averageAmount.getCurrency()
          }
        };
      }
    }

    const result: {
      id: string;
      holder: string;
      accountNumber: string;
      bank: string;
      cardType: CardNetworkType;
      period: {
        previousClosing: string;
        previousDueDate: string;
        currentClosing: string;
        currentDueDate: string;
        periodLength: number;
        daysUntilDue: number;
        isOverdue: boolean;
      };
      totals: {
        pesos: { amount: number; formatted: string; };
        dollars: { amount: number; formatted: string; };
        minimumPayment: { amount: number; formatted: string; };
      };
      transactions: any[];
      categoryBreakdown?: {
        [categoryName: string]: {
          total: { amount: number; formatted: string; currency: string; };
          count: number;
          percentage: number;
          averageAmount: { amount: number; formatted: string; currency: string; };
        };
      };
      stats: {
        totalTransactions: number;
        expenseTransactions: number;
        categorizedTransactions: number;
        uncategorizedTransactions: number;
        categorizationPercentage: number;
        totalCategories: number;
      };
      metadata?: ProcessingMetadata;
    } = {
      id: this._id,
      holder: this._holder,
      accountNumber: this._accountNumber,
      bank: this._bank,
      cardType: this._cardType,
      period: {
        ...periodDates,
        periodLength: this._period.getPeriodLength(),
        daysUntilDue: this._period.getDaysUntilDue(),
        isOverdue: this._period.isOverdue()
      },
      totals: {
        pesos: {
          amount: this._totals.pesos.getValue(),
          formatted: this._totals.pesos.format()
        },
        dollars: {
          amount: this._totals.dollars.getValue(),
          formatted: this._totals.dollars.format()
        },
        minimumPayment: {
          amount: this._totals.minimumPayment.getValue(),
          formatted: this._totals.minimumPayment.format()
        }
      },
      transactions: this._transactions.map(tx => tx.toFrontendFormat()),
      categoryBreakdown: frontendCategoryBreakdown,
      stats: this.getCategorizationStats()
    };

    if (this._metadata) {
      result.metadata = this._metadata;
    }

    return result;
  }

  /**
   * Returns a summary string for display
   */
  toString(): string {
    const stats = this.getCategorizationStats();
    const totalExpenses = this.getTotalExpenses();
    
    return `ExpenseStatement(${this._bank}) ${this._holder} - ${stats.totalTransactions} transactions, ${totalExpenses.format()} total expenses`;
  }
}