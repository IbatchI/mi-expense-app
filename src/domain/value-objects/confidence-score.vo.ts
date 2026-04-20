/**
 * Confidence Score value object - represents confidence levels for ML/AI operations
 */

export class ConfidenceScore {
  private constructor(private readonly _value: number) {}

  public static create(value: number): ConfidenceScore {
    if (value < 0 || value > 1) {
      throw new Error('Confidence score must be between 0 and 1');
    }

    if (!Number.isFinite(value)) {
      throw new Error('Confidence score must be a finite number');
    }

    return new ConfidenceScore(value);
  }

  public static fromPercentage(percentage: number): ConfidenceScore {
    return ConfidenceScore.create(percentage / 100);
  }

  public static high(): ConfidenceScore {
    return new ConfidenceScore(0.9);
  }

  public static medium(): ConfidenceScore {
    return new ConfidenceScore(0.7);
  }

  public static low(): ConfidenceScore {
    return new ConfidenceScore(0.5);
  }

  public static zero(): ConfidenceScore {
    return new ConfidenceScore(0);
  }

  // Getters
  public get value(): number {
    return this._value;
  }

  // Compatibility getter
  public getValue(): number {
    return this._value;
  }

  public get percentage(): number {
    return this._value * 100;
  }

  // Classification methods
  public isHigh(): boolean {
    return this._value >= 0.8;
  }

  public isMedium(): boolean {
    return this._value >= 0.6 && this._value < 0.8;
  }

  public isLow(): boolean {
    return this._value >= 0.4 && this._value < 0.6;
  }

  public isVeryLow(): boolean {
    return this._value < 0.4;
  }

  public isAcceptable(threshold: number = 0.7): boolean {
    return this._value >= threshold;
  }

  // Comparisons
  public isGreaterThan(other: ConfidenceScore): boolean {
    return this._value > other._value;
  }

  public equals(other: ConfidenceScore): boolean {
    return Math.abs(this._value - other._value) < 0.001; // Small epsilon for floating point comparison
  }

  // Formatting
  public format(): string {
    return `${(this._value * 100).toFixed(1)}%`;
  }

  public getQualityLabel(): string {
    if (this.isHigh()) return 'High';
    if (this.isMedium()) return 'Medium';
    if (this.isLow()) return 'Low';
    return 'Very Low';
  }

  public getQualityLabelSpanish(): string {
    if (this.isHigh()) return 'Alta';
    if (this.isMedium()) return 'Media';
    if (this.isLow()) return 'Baja';
    return 'Muy Baja';
  }

  // Serialization
  public toJSON() {
    return {
      value: this._value,
      percentage: this.percentage,
      formatted: this.format(),
      quality: this.getQualityLabel()
    };
  }

  public toString(): string {
    return this.format();
  }
}