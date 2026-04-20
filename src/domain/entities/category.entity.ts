import { ConfidenceScore } from '../value-objects/confidence-score.vo';

/**
 * Category Domain Entity
 * 
 * Represents an expense category with immutable properties and business rules.
 * Categories are used for transaction classification and expense tracking.
 */
export class Category {
  private constructor(
    private readonly _id: string,
    private readonly _name: string,
    private readonly _englishName: string,
    private readonly _tags: readonly string[],
    private readonly _iconName: string,
    private readonly _color: string,
    private readonly _description?: string
  ) {
    this.validateCategory();
  }

  /**
   * Creates a new Category with validation
   */
  static create(
    id: string,
    name: string,
    englishName: string,
    tags: string[],
    iconName: string,
    color: string,
    description?: string
  ): Category {
    return new Category(id, name, englishName, [...tags], iconName, color, description);
  }

  /**
   * Creates a Category from the existing Spanish categories system
   */
  static fromSpanishCategory(
    spanishName: string,
    englishName: string,
    tags: string[],
    iconName: string,
    color: string,
    description?: string
  ): Category {
    const id = this.generateIdFromName(spanishName);
    return new Category(id, spanishName, englishName, [...tags], iconName, color, description);
  }

  private static generateIdFromName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private validateCategory(): void {
    if (!this._id || this._id.trim().length === 0) {
      throw new Error('Category ID cannot be empty');
    }

    if (!this._name || this._name.trim().length === 0) {
      throw new Error('Category name cannot be empty');
    }

    if (!this._englishName || this._englishName.trim().length === 0) {
      throw new Error('Category English name cannot be empty');
    }

    if (!this._iconName || this._iconName.trim().length === 0) {
      throw new Error('Category icon name cannot be empty');
    }

    if (!this._color || !this.isValidColor(this._color)) {
      throw new Error('Category color must be a valid hex color');
    }

    if (this._tags.some(tag => !tag || tag.trim().length === 0)) {
      throw new Error('All category tags must be non-empty strings');
    }

    // Validate tags start with #
    if (this._tags.some(tag => !tag.startsWith('#'))) {
      throw new Error('All category tags must start with #');
    }
  }

  private isValidColor(color: string): boolean {
    const hexColorRegex = /^#([0-9A-Fa-f]{3}){1,2}$/;
    return hexColorRegex.test(color);
  }

  // Getters
  get id(): string {
    return this._id;
  }

  get name(): string {
    return this._name;
  }

  get englishName(): string {
    return this._englishName;
  }

  get tags(): readonly string[] {
    return [...this._tags];
  }

  get iconName(): string {
    return this._iconName;
  }

  get color(): string {
    return this._color;
  }

  get description(): string | undefined {
    return this._description;
  }

  /**
   * Checks if this category matches a given tag
   */
  hasTag(tag: string): boolean {
    const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
    return this._tags.includes(normalizedTag);
  }

  /**
   * Calculates relevance score for a transaction description
   * Returns confidence score based on how well the description matches category tags
   */
  calculateRelevanceFor(description: string): ConfidenceScore {
    if (!description || description.trim().length === 0) {
      return ConfidenceScore.create(0);
    }

    const normalizedDescription = description.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remove accents

    let matchCount = 0;
    let totalWeight = 0;

    for (const tag of this._tags) {
      const tagWithoutHash = tag.substring(1); // Remove #
      const normalizedTag = tagWithoutHash.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      // Different matching strategies with different weights
      if (normalizedDescription.includes(normalizedTag)) {
        if (normalizedDescription === normalizedTag) {
          // Exact match - highest weight
          matchCount += 1.0;
        } else if (normalizedDescription.includes(` ${normalizedTag} `)) {
          // Whole word match - high weight
          matchCount += 0.8;
        } else {
          // Substring match - medium weight
          matchCount += 0.5;
        }
        totalWeight += 1.0;
      } else {
        totalWeight += 1.0;
      }
    }

    const relevanceScore = totalWeight > 0 ? matchCount / totalWeight : 0;
    return ConfidenceScore.create(relevanceScore);
  }

  /**
   * Returns a display-friendly representation
   */
  getDisplayInfo(): {
    name: string;
    englishName: string;
    icon: string;
    color: string;
    tagCount: number;
  } {
    return {
      name: this._name,
      englishName: this._englishName,
      icon: this._iconName,
      color: this._color,
      tagCount: this._tags.length
    };
  }

  /**
   * Converts to a plain object for serialization
   */
  toPlainObject(): {
    id: string;
    name: string;
    englishName: string;
    tags: string[];
    iconName: string;
    color: string;
    description?: string;
  } {
    const result: {
      id: string;
      name: string;
      englishName: string;
      tags: string[];
      iconName: string;
      color: string;
      description?: string;
    } = {
      id: this._id,
      name: this._name,
      englishName: this._englishName,
      tags: [...this._tags],
      iconName: this._iconName,
      color: this._color
    };

    if (this._description !== undefined) {
      result.description = this._description;
    }

    return result;
  }

  /**
   * Creates a Category from a plain object
   */
  static fromPlainObject(obj: any): Category {
    if (!obj || typeof obj !== 'object') {
      throw new Error('Invalid category object');
    }

    return new Category(
      obj.id,
      obj.name,
      obj.englishName,
      obj.tags || [],
      obj.iconName,
      obj.color,
      obj.description
    );
  }

  /**
   * Checks equality with another Category
   */
  equals(other: Category): boolean {
    if (!other || !(other instanceof Category)) {
      return false;
    }

    return (
      this._id === other._id &&
      this._name === other._name &&
      this._englishName === other._englishName &&
      this._iconName === other._iconName &&
      this._color === other._color &&
      this._description === other._description &&
      this._tags.length === other._tags.length &&
      this._tags.every((tag, index) => tag === other._tags[index])
    );
  }

  /**
   * Returns a string representation of the category
   */
  toString(): string {
    return `Category(${this._name}/${this._englishName}) - ${this._tags.length} tags`;
  }
}