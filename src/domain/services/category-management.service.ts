/**
 * Category Management Domain Service
 * 
 * Provides business logic for managing expense categories, including
 * category matching, relevance scoring, and category recommendations.
 */

import { Category } from '../entities/category.entity';
import { Transaction } from '../entities/transaction.entity';
import { ConfidenceScore } from '../value-objects/confidence-score.vo';
import { CATEGORY_DESIGNS } from '../../shared/constants/category-designs';

export interface CategoryMatchResult {
  category: Category;
  confidence: ConfidenceScore;
  matchingTags: string[];
  reasoning: string;
}

export interface CategorySuggestion {
  categoryName: string;
  confidence: number;
  reasoning: string;
  matchingKeywords: string[];
}

export class CategoryManagementService {
  private readonly builtInCategories: Category[] = [];

  constructor() {
    this.initializeBuiltInCategories();
  }

  /**
   * Find the best matching category for a transaction
   */
  findBestMatch(transaction: Transaction, availableCategories: Category[]): CategoryMatchResult | null {
    if (availableCategories.length === 0) {
      return null;
    }

    let bestMatch: CategoryMatchResult | null = null;
    let highestConfidence = 0;

    for (const category of availableCategories) {
      const confidence = category.calculateRelevanceFor(transaction.description);
      
      if (confidence.getValue() > highestConfidence && confidence.getValue() >= 0.3) {
        const matchingTags = this.findMatchingTags(transaction.description, category.tags);
        
        bestMatch = {
          category,
          confidence,
          matchingTags,
          reasoning: this.generateReasoning(transaction.description, category, matchingTags)
        };
        
        highestConfidence = confidence.getValue();
      }
    }

    return bestMatch;
  }

  /**
   * Get multiple category suggestions for a transaction
   */
  getSuggestions(
    transaction: Transaction, 
    availableCategories: Category[], 
    maxSuggestions: number = 3
  ): CategorySuggestion[] {
    const suggestions: CategorySuggestion[] = [];

    for (const category of availableCategories) {
      const confidence = category.calculateRelevanceFor(transaction.description);
      
      if (confidence.getValue() > 0.1) { // Lower threshold for suggestions
        const matchingTags = this.findMatchingTags(transaction.description, category.tags);
        const matchingKeywords = this.extractMatchingKeywords(transaction.description, category.tags);
        
        suggestions.push({
          categoryName: category.name,
          confidence: confidence.getValue(),
          reasoning: this.generateReasoning(transaction.description, category, matchingTags),
          matchingKeywords
        });
      }
    }

    // Sort by confidence descending and return top suggestions
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxSuggestions);
  }

  /**
   * Create a new category with validation and design assignment
   */
  createCategory(
    name: string,
    englishName: string,
    tags: string[],
    description?: string
  ): Category {
    // Auto-assign design if available
    const design = CATEGORY_DESIGNS[name];
    const iconName = design ? design.icon : '🏷️';
    const color = design ? design.color : '#6B7280';

    return Category.fromSpanishCategory(
      name,
      englishName,
      tags,
      iconName,
      color,
      description
    );
  }

  /**
   * Get all built-in categories
   */
  getBuiltInCategories(): Category[] {
    return [...this.builtInCategories];
  }

  /**
   * Suggest category improvements based on transaction patterns
   */
  suggestCategoryImprovements(
    category: Category, 
    transactions: Transaction[]
  ): {
    newTagSuggestions: string[];
    confidence: number;
    reasoning: string;
  } {
    const categorizedTransactions = transactions.filter(tx => 
      tx.category && tx.category.equals(category)
    );

    if (categorizedTransactions.length < 3) {
      return {
        newTagSuggestions: [],
        confidence: 0,
        reasoning: 'Not enough categorized transactions to suggest improvements'
      };
    }

    // Analyze common words/patterns in categorized transactions
    const commonWords = this.findCommonWords(
      categorizedTransactions.map(tx => tx.description)
    );

    // Filter out existing tags and common stopwords
    const existingTags = category.tags.map(tag => tag.toLowerCase().replace('#', ''));
    const stopwords = ['de', 'la', 'el', 'en', 'con', 'por', 'para', 'un', 'una', 'and', 'the', 'of', 'in'];
    
    const newTagSuggestions = commonWords
      .filter(word => 
        !existingTags.includes(word.toLowerCase()) &&
        !stopwords.includes(word.toLowerCase()) &&
        word.length >= 3
      )
      .slice(0, 5)
      .map(word => `#${word.toLowerCase()}`);

    const confidence = Math.min(categorizedTransactions.length / 10, 1.0);

    return {
      newTagSuggestions,
      confidence,
      reasoning: `Based on analysis of ${categorizedTransactions.length} transactions categorized as "${category.name}"`
    };
  }

  /**
   * Validate category consistency across transactions
   */
  validateCategoryConsistency(
    category: Category,
    transactions: Transaction[]
  ): {
    isConsistent: boolean;
    inconsistentTransactions: Transaction[];
    recommendedActions: string[];
  } {
    const categorizedTransactions = transactions.filter(tx =>
      tx.category && tx.category.equals(category)
    );

    const inconsistentTransactions: Transaction[] = [];
    const recommendedActions: string[] = [];

    for (const transaction of categorizedTransactions) {
      const confidence = category.calculateRelevanceFor(transaction.description);
      
      if (confidence.getValue() < 0.3) {
        inconsistentTransactions.push(transaction);
      }
    }

    if (inconsistentTransactions.length > 0) {
      recommendedActions.push('Review and potentially recategorize flagged transactions');
      
      if (inconsistentTransactions.length > categorizedTransactions.length * 0.3) {
        recommendedActions.push('Consider updating category tags to better match transaction patterns');
      }
    }

    return {
      isConsistent: inconsistentTransactions.length === 0,
      inconsistentTransactions,
      recommendedActions
    };
  }

  private initializeBuiltInCategories(): void {
    const categoryDefinitions = [
      {
        name: "Hogar",
        englishName: "Home",
        tags: ["#alquiler", "#expensas", "#luz", "#gas", "#agua", "#internet", "#telefono"],
        description: "Gastos relacionados con la vivienda"
      },
      {
        name: "Alimentación",
        englishName: "Food",
        tags: ["#supermercado", "#restaurantes", "#delivery", "#cafe", "#snacks", "#comida"],
        description: "Comida y bebidas"
      },
      {
        name: "Transporte",
        englishName: "Transport",
        tags: ["#combustible", "#transporte_publico", "#uber", "#taxi", "#peajes", "#mantenimiento_auto"],
        description: "Transporte y vehículos"
      },
      {
        name: "Ocio y Entretenimiento",
        englishName: "Entertainment",
        tags: ["#salidas", "#streaming", "#cine", "#eventos", "#juegos", "#entretenimiento"],
        description: "Entretenimiento y recreación"
      },
      {
        name: "Salud",
        englishName: "Health",
        tags: ["#obra_social", "#seguro_medico", "#medicamentos", "#consultas_medicas", "#farmacia"],
        description: "Gastos médicos y de salud"
      },
      {
        name: "Compras Personales",
        englishName: "Personal Shopping",
        tags: ["#ropa", "#tecnologia", "#accesorios", "#compras", "#shopping"],
        description: "Compras personales y ropa"
      },
      {
        name: "Educación",
        englishName: "Education",
        tags: ["#cursos", "#libros", "#suscripciones_educativas", "#educacion", "#capacitacion"],
        description: "Educación y formación"
      },
      {
        name: "Mascotas",
        englishName: "Pets",
        tags: ["#alimento_mascota", "#veterinario", "#mascotas", "#pets"],
        description: "Cuidado de mascotas"
      },
      {
        name: "Trabajo / Negocio",
        englishName: "Work / Business",
        tags: ["#gastos_laborales", "#herramientas", "#materiales", "#trabajo", "#oficina"],
        description: "Gastos relacionados con el trabajo"
      },
      {
        name: "Descuentos",
        englishName: "Discounts",
        tags: ["#descuento", "#promocion", "#rebate", "#cashback", "#reintegro", "#bonificacion"],
        description: "Descuentos y reintegros en compras"
      },
      {
        name: "Otros",
        englishName: "Other",
        tags: ["#varios", "#miscelaneos", "#otros"],
        description: "Gastos varios no categorizados"
      }
    ];

    for (const def of categoryDefinitions) {
      try {
        const category = this.createCategory(
          def.name,
          def.englishName,
          def.tags,
          def.description
        );
        this.builtInCategories.push(category);
      } catch (error) {
        console.warn(`Failed to create built-in category "${def.name}":`, error);
      }
    }
  }

  private findMatchingTags(description: string, tags: readonly string[]): string[] {
    const normalizedDescription = description.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remove accents

    return tags.filter(tag => {
      const tagWithoutHash = tag.substring(1); // Remove #
      const normalizedTag = tagWithoutHash.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      return normalizedDescription.includes(normalizedTag);
    });
  }

  private extractMatchingKeywords(description: string, tags: readonly string[]): string[] {
    const matchingTags = this.findMatchingTags(description, tags);
    return matchingTags.map(tag => tag.substring(1)); // Remove # prefix
  }

  private generateReasoning(
    description: string, 
    category: Category, 
    matchingTags: string[]
  ): string {
    if (matchingTags.length === 0) {
      return `Low confidence match for category "${category.name}"`;
    }

    const keywords = matchingTags.map(tag => tag.substring(1)).join(', ');
    return `Matched keywords: ${keywords} in transaction "${description}"`;
  }

  private findCommonWords(descriptions: string[]): string[] {
    const wordCounts = new Map<string, number>();

    for (const description of descriptions) {
      const words = description
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length >= 3);

      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    // Return words that appear in at least 30% of descriptions
    const minFrequency = Math.ceil(descriptions.length * 0.3);
    
    return Array.from(wordCounts.entries())
      .filter(([_, count]) => count >= minFrequency)
      .sort(([_, a], [__, b]) => b - a)
      .map(([word, _]) => word)
      .slice(0, 10);
  }
}