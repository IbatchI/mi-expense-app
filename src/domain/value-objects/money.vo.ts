/**
 * Money value object - handles currency amounts with proper validation
 */

export type Currency = 'ARS' | 'USD' | 'EUR';

export class Money {
  private constructor(
    private readonly _amount: number,
    private readonly _currency: Currency
  ) {}

  public static create(amount: number, currency: Currency): Money {
    if (!Number.isFinite(amount)) {
      throw new Error('Amount must be a finite number');
    }

    return new Money(amount, currency);
  }

  public static zero(currency: Currency = 'ARS'): Money {
    return new Money(0, currency);
  }

  public static fromPesos(amount: number): Money {
    return Money.create(amount, 'ARS');
  }

  public static fromUSD(amount: number): Money {
    return Money.create(amount, 'USD');
  }

  // Convenience factory methods with different names for compatibility
  public static pesos(amount: number): Money {
    return Money.fromPesos(amount);
  }

  public static dollars(amount: number): Money {
    return Money.fromUSD(amount);
  }

  // Getters
  public get amount(): number {
    return this._amount;
  }

  public get currency(): Currency {
    return this._currency;
  }

  // Compatibility getters
  public getValue(): number {
    return this._amount;
  }

  public getCurrency(): Currency {
    return this._currency;
  }

  // Operations
  public add(other: Money): Money {
    if (this._currency !== other._currency) {
      throw new Error(`Cannot add different currencies: ${this._currency} and ${other._currency}`);
    }
    return new Money(this._amount + other._amount, this._currency);
  }

  public subtract(other: Money): Money {
    if (this._currency !== other._currency) {
      throw new Error(`Cannot subtract different currencies: ${this._currency} and ${other._currency}`);
    }
    return new Money(this._amount - other._amount, this._currency);
  }

  public multiply(factor: number): Money {
    return new Money(this._amount * factor, this._currency);
  }

  public divide(divisor: number): Money {
    if (divisor === 0) {
      throw new Error('Cannot divide by zero');
    }
    return new Money(this._amount / divisor, this._currency);
  }

  // Comparisons
  public equals(other: Money): boolean {
    return this._amount === other._amount && this._currency === other._currency;
  }

  public isGreaterThan(other: Money): boolean {
    if (this._currency !== other._currency) {
      throw new Error(`Cannot compare different currencies: ${this._currency} and ${other._currency}`);
    }
    return this._amount > other._amount;
  }

  public isZero(): boolean {
    return this._amount === 0;
  }

  // Formatting
  public format(): string {
    const formatter = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: this._currency,
      minimumFractionDigits: 2
    });

    return formatter.format(this._amount);
  }

  public formatSimple(): string {
    return `$${this._amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ${this._currency}`;
  }

  // Serialization for API responses
  public toJSON() {
    return {
      amount: this._amount,
      currency: this._currency,
      formatted: this.format()
    };
  }

  public toPlainObject() {
    return {
      amount: this._amount,
      currency: this._currency
    };
  }

  // Deserialization from plain objects
  public static fromPlainObject(obj: any): Money {
    if (!obj || typeof obj !== 'object') {
      throw new Error('Invalid money object');
    }

    if (typeof obj.amount !== 'number') {
      throw new Error('Money amount must be a number');
    }

    if (!obj.currency || typeof obj.currency !== 'string') {
      throw new Error('Money currency must be a valid string');
    }

    return Money.create(obj.amount, obj.currency as Currency);
  }

  public toString(): string {
    return this.format();
  }
}