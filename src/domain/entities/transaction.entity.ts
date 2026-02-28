import { Money } from '../value-objects/money.vo';
import { ConfidenceScore } from '../value-objects/confidence-score.vo';
import { Category } from './category.entity';

/**
 * Transaction Types
 */
export type TransactionType = 'purchase' | 'payment' | 'fee' | 'tax' | 'refund' | 'adjustment';

/**
 * Transaction Domain Entity
 * 
 * Represents a credit card transaction with immutable properties and business rules.
 * Handles different bank formats and maintains transaction integrity.
 */
export class Transaction {
  private constructor(
    private readonly _id: string,
    private readonly _date: Date,
    private readonly _description: string,
    private readonly _amount: Money,
    private readonly _type: TransactionType,
    private readonly _merchant: string,
    private readonly _installments?: string,
    private readonly _reference?: string,
    private readonly _voucher?: string,
    private readonly _category?: Category,
    private readonly _categoryConfidence?: ConfidenceScore,
    private readonly _tags: readonly string[] = []
  ) {
    this.validateTransaction();
  }

  /**
   * Creates a new Transaction with validation
   */
  static create(params: {
    id: string;
    date: Date | string;
    description: string;
    amount: Money;
    type: TransactionType;
    merchant: string;
    installments?: string;
    reference?: string;
    voucher?: string;
    category?: Category;
    categoryConfidence?: ConfidenceScore;
    tags?: string[];
  }): Transaction {
    const date = typeof params.date === 'string' ? this.parseDate(params.date) : new Date(params.date);
    
    return new Transaction(
      params.id,
      date,
      params.description,
      params.amount,
      params.type,
      params.merchant,
      params.installments,
      params.reference,
      params.voucher,
      params.category,
      params.categoryConfidence,
      params.tags ? [...params.tags] : []
    );
  }

  /**
   * Creates a Transaction from Galicia bank format
   */
  static fromGaliciaFormat(params: {
    date: string;
    merchant: string;
    installment: string | null;
    voucher: string;
    amountPesos: number;
    amountDollars: number;
    category?: Category;
    categoryConfidence?: ConfidenceScore;
  }): Transaction {
    const id = this.generateTransactionId(params.date, params.merchant, params.voucher);
    const date = this.parseDate(params.date);
    
    // Determine primary amount based on which is non-zero
    const primaryAmount = params.amountPesos !== 0 
      ? Money.pesos(params.amountPesos)
      : Money.dollars(params.amountDollars);

    // Extract merchant from description
    const merchant = this.extractMerchant(params.merchant);
    
    return new Transaction(
      id,
      date,
      params.merchant,
      primaryAmount,
      this.determineTransactionType(params.merchant, primaryAmount),
      merchant,
      params.installment || undefined,
      undefined,
      params.voucher,
      params.category,
      params.categoryConfidence
    );
  }

  /**
   * Creates a Transaction from Pampa bank format
   */
  static fromPampaFormat(params: {
    date: string;
    description: string;
    amount: number;
    currency?: string;
    type?: TransactionType;
    installments?: string;
    reference?: string;
    category?: Category;
    categoryConfidence?: ConfidenceScore;
  }): Transaction {
    const id = this.generateTransactionId(params.date, params.description, params.reference || '');
    const date = this.parseDate(params.date);
    
    const amount = params.currency === 'USD' 
      ? Money.dollars(params.amount)
      : Money.pesos(params.amount);

    const merchant = this.extractMerchant(params.description);
    
    return new Transaction(
      id,
      date,
      params.description,
      amount,
      params.type || this.determineTransactionType(params.description, amount),
      merchant,
      params.installments,
      params.reference,
      undefined,
      params.category,
      params.categoryConfidence
    );
  }

  private static parseDate(dateStr: string): Date {
    if (!dateStr || typeof dateStr !== 'string') {
      throw new Error('Transaction date must be a non-empty string');
    }

    // Support different date formats
    const formats = [
      /^\d{4}-\d{2}-\d{2}$/,      // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{4}$/,    // DD/MM/YYYY
      /^\d{2}-\d{2}-\d{4}$/       // DD-MM-YYYY
    ];

    if (!formats.some(format => format.test(dateStr))) {
      throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD, DD/MM/YYYY, or DD-MM-YYYY`);
    }

    let date: Date;
    
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      date = new Date(dateStr + 'T00:00:00.000Z');
    } else {
      // Convert DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
      const parts = dateStr.split(/[\/\-]/);
      const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      date = new Date(isoDate + 'T00:00:00.000Z');
    }

    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${dateStr}`);
    }

    return date;
  }

  private static generateTransactionId(date: string, description: string, reference: string): string {
    const normalizedDate = date.replace(/[\/\-]/g, '');
    const normalizedDesc = description
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 20);
    const normalizedRef = reference.replace(/[^a-z0-9]/gi, '').substring(0, 10);
    
    return `${normalizedDate}_${normalizedDesc}_${normalizedRef}`;
  }

  private static extractMerchant(description: string): string {
    if (!description || description.trim().length === 0) {
      return 'UNKNOWN_MERCHANT';
    }

    // Remove common prefixes and clean up
    const cleaned = description
      .replace(/^(COMPRA\s+|PAGO\s+|CUOTA\s+)/i, '')
      .replace(/\s+\d{2}\/\d{2}.*$/, '') // Remove dates at end
      .replace(/\s+\$.*$/, '') // Remove amounts at end
      .trim();

    return cleaned || 'UNKNOWN_MERCHANT';
  }

  private static determineTransactionType(description: string, amount: Money): TransactionType {
    const desc = description.toLowerCase();
    
    if (amount.getValue() < 0) {
      return 'payment';
    }
    
    if (desc.includes('cuota') || desc.includes('fee') || desc.includes('comision')) {
      return 'fee';
    }
    
    if (desc.includes('tax') || desc.includes('impuesto') || desc.includes('iva')) {
      return 'tax';
    }
    
    if (desc.includes('devolucion') || desc.includes('refund') || desc.includes('reintegro')) {
      return 'refund';
    }
    
    if (desc.includes('ajuste') || desc.includes('adjustment')) {
      return 'adjustment';
    }
    
    return 'purchase';
  }

  private validateTransaction(): void {
    if (!this._id || this._id.trim().length === 0) {
      throw new Error('Transaction ID cannot be empty');
    }

    if (!this._description || this._description.trim().length === 0) {
      throw new Error('Transaction description cannot be empty');
    }

    if (!this._merchant || this._merchant.trim().length === 0) {
      throw new Error('Transaction merchant cannot be empty');
    }

    if (isNaN(this._date.getTime())) {
      throw new Error('Transaction date must be valid');
    }

    // Validate category and confidence are consistent
    if (this._category && !this._categoryConfidence) {
      throw new Error('Transaction with category must have confidence score');
    }

    if (!this._category && this._categoryConfidence) {
      throw new Error('Transaction with confidence score must have category');
    }

    // Validate installments format if present
    if (this._installments && !this.isValidInstallmentFormat(this._installments)) {
      throw new Error('Invalid installment format. Expected format: "1/12" or "03/12"');
    }
  }

  private isValidInstallmentFormat(installments: string): boolean {
    return /^\d{1,2}\/\d{1,2}$/.test(installments);
  }

  // Getters
  get id(): string {
    return this._id;
  }

  get date(): Date {
    return new Date(this._date);
  }

  get description(): string {
    return this._description;
  }

  get amount(): Money {
    return this._amount;
  }

  get type(): TransactionType {
    return this._type;
  }

  get merchant(): string {
    return this._merchant;
  }

  get installments(): string | undefined {
    return this._installments;
  }

  get reference(): string | undefined {
    return this._reference;
  }

  get voucher(): string | undefined {
    return this._voucher;
  }

  get category(): Category | undefined {
    return this._category;
  }

  get categoryConfidence(): ConfidenceScore | undefined {
    return this._categoryConfidence;
  }

  get tags(): readonly string[] {
    return [...this._tags];
  }

  /**
   * Returns the transaction date as a formatted string
   */
  getDateString(): string {
    return this._date.toISOString().split('T')[0];
  }

  /**
   * Checks if the transaction is categorized
   */
  isCategorized(): boolean {
    return this._category !== undefined && this._categoryConfidence !== undefined;
  }

  /**
   * Checks if the transaction is an expense (positive amount)
   */
  isExpense(): boolean {
    return this._amount.getValue() > 0 && this._type !== 'payment' && this._type !== 'refund';
  }

  /**
   * Checks if the transaction is a payment (negative amount)
   */
  isPayment(): boolean {
    return this._amount.getValue() < 0 || this._type === 'payment';
  }

  /**
   * Checks if the transaction has installments
   */
  hasInstallments(): boolean {
    return this._installments !== undefined;
  }

  /**
   * Gets installment information if available
   */
  getInstallmentInfo(): { current: number; total: number } | null {
    if (!this._installments) {
      return null;
    }

    const parts = this._installments.split('/');
    return {
      current: parseInt(parts[0], 10),
      total: parseInt(parts[1], 10)
    };
  }

  /**
   * Assigns a category with confidence to this transaction
   * Returns a new Transaction instance with the category assigned
   */
  categorize(category: Category, confidence: ConfidenceScore): Transaction {
    return new Transaction(
      this._id,
      this._date,
      this._description,
      this._amount,
      this._type,
      this._merchant,
      this._installments,
      this._reference,
      this._voucher,
      category,
      confidence,
      this._tags
    );
  }

  /**
   * Adds tags to this transaction
   * Returns a new Transaction instance with the tags added
   */
  addTags(newTags: string[]): Transaction {
    const combinedTags = [...this._tags, ...newTags];
    const uniqueTags = [...new Set(combinedTags)];

    return new Transaction(
      this._id,
      this._date,
      this._description,
      this._amount,
      this._type,
      this._merchant,
      this._installments,
      this._reference,
      this._voucher,
      this._category,
      this._categoryConfidence,
      uniqueTags
    );
  }

  /**
   * Converts to a frontend-friendly format with category design information
   */
  toFrontendFormat(): {
    id: string;
    date: string;
    description: string;
    merchant: string;
    amount: {
      value: number;
      currency: string;
      formatted: string;
    };
    type: TransactionType;
    installments?: string;
    reference?: string;
    voucher?: string;
    category?: {
      name: string;
      englishName: string;
      icon: string;
      color: string;
      confidence: number;
    };
    tags: string[];
  } {
    const result: any = {
      id: this._id,
      date: this.getDateString(),
      description: this._description,
      merchant: this._merchant,
      amount: {
        value: this._amount.getValue(),
        currency: this._amount.getCurrency(),
        formatted: this._amount.format()
      },
      type: this._type,
      tags: [...this._tags]
    };

    if (this._installments) {
      result.installments = this._installments;
    }

    if (this._reference) {
      result.reference = this._reference;
    }

    if (this._voucher) {
      result.voucher = this._voucher;
    }

    if (this._category && this._categoryConfidence) {
      const categoryInfo = this._category.getDisplayInfo();
      result.category = {
        name: categoryInfo.name,
        englishName: categoryInfo.englishName,
        icon: categoryInfo.icon,
        color: categoryInfo.color,
        confidence: this._categoryConfidence.getValue()
      };
    }

    return result;
  }

  /**
   * Converts to a plain object for serialization
   */
  toPlainObject(): any {
    const result: any = {
      id: this._id,
      date: this.getDateString(),
      description: this._description,
      amount: this._amount.toPlainObject(),
      type: this._type,
      merchant: this._merchant,
      tags: [...this._tags]
    };

    if (this._installments) {
      result.installments = this._installments;
    }

    if (this._reference) {
      result.reference = this._reference;
    }

    if (this._voucher) {
      result.voucher = this._voucher;
    }

    if (this._category) {
      result.category = this._category.toPlainObject();
    }

    if (this._categoryConfidence) {
      result.categoryConfidence = this._categoryConfidence.getValue();
    }

    return result;
  }

  /**
   * Creates a Transaction from a plain object
   */
  static fromPlainObject(obj: any): Transaction {
    if (!obj || typeof obj !== 'object') {
      throw new Error('Invalid transaction object');
    }

    const amount = Money.fromPlainObject(obj.amount);
    const category = obj.category ? Category.fromPlainObject(obj.category) : undefined;
    const categoryConfidence = obj.categoryConfidence 
      ? ConfidenceScore.create(obj.categoryConfidence)
      : undefined;

    return new Transaction(
      obj.id,
      new Date(obj.date + 'T00:00:00.000Z'),
      obj.description,
      amount,
      obj.type,
      obj.merchant,
      obj.installments,
      obj.reference,
      obj.voucher,
      category,
      categoryConfidence,
      obj.tags || []
    );
  }

  /**
   * Checks equality with another Transaction
   */
  equals(other: Transaction): boolean {
    if (!other || !(other instanceof Transaction)) {
      return false;
    }

    return (
      this._id === other._id &&
      this._date.getTime() === other._date.getTime() &&
      this._description === other._description &&
      this._amount.equals(other._amount) &&
      this._type === other._type &&
      this._merchant === other._merchant &&
      this._installments === other._installments &&
      this._reference === other._reference &&
      this._voucher === other._voucher &&
      ((this._category === undefined && other._category === undefined) ||
       (this._category !== undefined && other._category !== undefined && this._category.equals(other._category))) &&
      ((this._categoryConfidence === undefined && other._categoryConfidence === undefined) ||
       (this._categoryConfidence !== undefined && other._categoryConfidence !== undefined && 
        this._categoryConfidence.equals(other._categoryConfidence)))
    );
  }

  /**
   * Returns a string representation of the transaction
   */
  toString(): string {
    const categoryInfo = this._category ? ` [${this._category.name}]` : '';
    return `Transaction(${this.getDateString()}) ${this._merchant}: ${this._amount.format()}${categoryInfo}`;
  }
}