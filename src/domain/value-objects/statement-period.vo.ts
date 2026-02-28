/**
 * StatementPeriod Value Object
 * 
 * Represents the billing period of a credit card statement with immutable dates.
 * Handles date validation and provides utility methods for period operations.
 */

export class StatementPeriod {
  private constructor(
    private readonly _previousClosing: Date,
    private readonly _previousDueDate: Date,
    private readonly _currentClosing: Date,
    private readonly _currentDueDate: Date
  ) {
    this.validatePeriod();
  }

  /**
   * Creates a new StatementPeriod from date strings in YYYY-MM-DD format
   */
  static fromDates(
    previousClosing: string,
    previousDueDate: string,
    currentClosing: string,
    currentDueDate: string
  ): StatementPeriod {
    const prevClosing = this.parseDate(previousClosing, 'previousClosing');
    const prevDue = this.parseDate(previousDueDate, 'previousDueDate');
    const currClosing = this.parseDate(currentClosing, 'currentClosing');
    const currDue = this.parseDate(currentDueDate, 'currentDueDate');

    return new StatementPeriod(prevClosing, prevDue, currClosing, currDue);
  }

  /**
   * Creates a new StatementPeriod from Date objects
   */
  static fromDateObjects(
    previousClosing: Date,
    previousDueDate: Date,
    currentClosing: Date,
    currentDueDate: Date
  ): StatementPeriod {
    return new StatementPeriod(
      new Date(previousClosing),
      new Date(previousDueDate),
      new Date(currentClosing),
      new Date(currentDueDate)
    );
  }

  private static parseDate(dateStr: string, fieldName: string): Date {
    if (!dateStr || typeof dateStr !== 'string') {
      throw new Error(`${fieldName} must be a non-empty string`);
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) {
      throw new Error(`${fieldName} must be in YYYY-MM-DD format, got: ${dateStr}`);
    }

    const date = new Date(dateStr + 'T00:00:00.000Z');
    if (isNaN(date.getTime())) {
      throw new Error(`${fieldName} is not a valid date: ${dateStr}`);
    }

    return date;
  }

  private validatePeriod(): void {
    // Previous closing should be before previous due date
    if (this._previousClosing >= this._previousDueDate) {
      throw new Error('Previous closing date must be before previous due date');
    }

    // Current closing should be before current due date
    if (this._currentClosing >= this._currentDueDate) {
      throw new Error('Current closing date must be before current due date');
    }

    // Current closing should be after previous closing
    if (this._currentClosing <= this._previousClosing) {
      throw new Error('Current closing date must be after previous closing date');
    }

    // Current due should be after previous due
    if (this._currentDueDate <= this._previousDueDate) {
      throw new Error('Current due date must be after previous due date');
    }
  }

  // Getters
  get previousClosing(): Date {
    return new Date(this._previousClosing);
  }

  get previousDueDate(): Date {
    return new Date(this._previousDueDate);
  }

  get currentClosing(): Date {
    return new Date(this._currentClosing);
  }

  get currentDueDate(): Date {
    return new Date(this._currentDueDate);
  }

  /**
   * Returns the period dates in YYYY-MM-DD string format
   */
  toDateStrings(): {
    previousClosing: string;
    previousDueDate: string;
    currentClosing: string;
    currentDueDate: string;
  } {
    return {
      previousClosing: this.formatDate(this._previousClosing),
      previousDueDate: this.formatDate(this._previousDueDate),
      currentClosing: this.formatDate(this._currentClosing),
      currentDueDate: this.formatDate(this._currentDueDate)
    };
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Returns the number of days in the current billing period
   */
  getPeriodLength(): number {
    const msInDay = 24 * 60 * 60 * 1000;
    return Math.round((this._currentClosing.getTime() - this._previousClosing.getTime()) / msInDay);
  }

  /**
   * Returns the number of days remaining until the current due date
   */
  getDaysUntilDue(referenceDate: Date = new Date()): number {
    const msInDay = 24 * 60 * 60 * 1000;
    return Math.round((this._currentDueDate.getTime() - referenceDate.getTime()) / msInDay);
  }

  /**
   * Checks if a given date falls within the current statement period
   */
  isDateInCurrentPeriod(date: Date): boolean {
    return date > this._previousClosing && date <= this._currentClosing;
  }

  /**
   * Checks if the payment is overdue based on a reference date
   */
  isOverdue(referenceDate: Date = new Date()): boolean {
    return referenceDate > this._currentDueDate;
  }

  /**
   * Returns a display-friendly period description
   */
  toString(): string {
    const current = this.toDateStrings();
    return `Period: ${current.previousClosing} to ${current.currentClosing} (Due: ${current.currentDueDate})`;
  }

  /**
   * Checks equality with another StatementPeriod
   */
  equals(other: StatementPeriod): boolean {
    if (!other || !(other instanceof StatementPeriod)) {
      return false;
    }

    return (
      this._previousClosing.getTime() === other._previousClosing.getTime() &&
      this._previousDueDate.getTime() === other._previousDueDate.getTime() &&
      this._currentClosing.getTime() === other._currentClosing.getTime() &&
      this._currentDueDate.getTime() === other._currentDueDate.getTime()
    );
  }
}