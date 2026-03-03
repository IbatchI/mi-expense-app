/**
 * Expense Classification Gateway Implementation
 * 
 * Wraps the existing ExpenseClassifier to provide expense categorization services.
 * Uses LLM-based classification for Spanish expense categories.
 */

import { 
  IExpenseClassificationGateway,
  GatewayResult,
  ClassificationRequest,
  ClassificationResult
} from '../../use-cases/gateways/interfaces';

export class ExpenseClassificationGateway implements IExpenseClassificationGateway {
  private classifier: any;

  constructor(private readonly llmExtractor: any) {
    this.initializeClassifier();
  }

  async classifyExpenses(request: ClassificationRequest): Promise<GatewayResult<ClassificationResult>> {
    const startTime = Date.now();

    try {
      if (!this.classifier) {
        return {
          success: false,
          error: 'Expense classifier not initialized',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      // Validate input
      if (!request.transactions || !Array.isArray(request.transactions)) {
        return {
          success: false,
          error: 'Transactions must be an array',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      if (!request.categories || !Array.isArray(request.categories)) {
        return {
          success: false,
          error: 'Categories must be an array',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      if (request.transactions.length === 0) {
        // Return empty result for no transactions
        return {
          success: true,
          data: {
            categorizedTransactions: [],
            uncategorizedTransactions: [],
            categoryBreakdown: {}
          },
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      // Create statement-like object for the classifier
      const statementData = {
        transactions: request.transactions,
        holder: 'Unknown',
        accountNumber: 'Unknown',
        bank: 'Unknown',
        period: {
          currentClosing: new Date().toISOString().split('T')[0]
        },
        totals: {
          pesos: 0,
          dollars: 0,
          minimumPayment: 0
        }
      };

      // Use the existing ExpenseClassifier
      const classificationResult = await this.classifier.classifyTransactions(statementData);

      if (!classificationResult.success) {
        return {
          success: false,
          error: `Classification failed: ${classificationResult.error}`,
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      const classifiedData = classificationResult.data;

      // Transform to gateway result format
      const categorizedTransactions = classifiedData.transactions
        .filter((tx: any) => tx.category && tx.confidence !== undefined)
        .map((tx: any) => ({
          transaction: tx,
          category: tx.category,
          confidence: tx.confidence,
          tags: tx.tags || [],
          reasoning: tx.reasoning || `Classified as ${tx.category} based on transaction description`
        }));

      const uncategorizedTransactions = classifiedData.transactions
        .filter((tx: any) => !tx.category || tx.confidence === undefined);

      // Convert category breakdown format
      const categoryBreakdown: any = {};
      if (classifiedData.categoryBreakdown) {
        for (const [categoryName, breakdown] of Object.entries(classifiedData.categoryBreakdown as any)) {
          const breakdownData = breakdown as any;
          categoryBreakdown[categoryName] = {
            count: breakdownData.count,
            totalAmount: breakdownData.total,
            averageConfidence: this.calculateAverageConfidence(categorizedTransactions, categoryName)
          };
        }
      }

      const result: ClassificationResult = {
        categorizedTransactions,
        uncategorizedTransactions,
        categoryBreakdown
      };

      return {
        success: true,
        data: result,
        metadata: {
          processingTime: Date.now() - startTime,
          totalTransactions: request.transactions.length,
          categorizedCount: categorizedTransactions.length,
          uncategorizedCount: uncategorizedTransactions.length,
          categorizationRate: categorizedTransactions.length / request.transactions.length,
          categoriesUsed: Object.keys(categoryBreakdown).length
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Expense classification failed: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime: Date.now() - startTime }
      };
    }
  }

  async suggestCategories(transactionDescription: string): Promise<GatewayResult<Array<{
    category: string;
    confidence: number;
    reasoning: string;
  }>>> {
    const startTime = Date.now();

    try {
      if (!transactionDescription || transactionDescription.trim().length === 0) {
        return {
          success: false,
          error: 'Transaction description cannot be empty',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      // Create a mock transaction for classification
      const mockTransaction = {
        date: new Date().toISOString().split('T')[0],
        description: transactionDescription,
        merchant: transactionDescription,
        amount: 100, // Mock amount
        type: 'purchase'
      };

      // Use the classification method with a single transaction
      const classificationResult = await this.classifyExpenses({
        transactions: [mockTransaction],
        categories: this.getDefaultCategories(),
        options: {
          confidenceThreshold: 0.1, // Low threshold to get multiple suggestions
          allowMultipleCategories: true,
          includeReasons: true
        }
      });

      if (!classificationResult.success || !classificationResult.data) {
        return {
          success: false,
          error: `Category suggestion failed: ${classificationResult.error}`,
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      // Extract suggestions from the classification result
      const suggestions = classificationResult.data.categorizedTransactions.map((ctx: any) => ({
        category: ctx.category,
        confidence: ctx.confidence,
        reasoning: ctx.reasoning || `Based on keywords in "${transactionDescription}"`
      }));

      // Sort by confidence descending
      suggestions.sort((a: any, b: any) => b.confidence - a.confidence);

      return {
        success: true,
        data: suggestions.slice(0, 5), // Return top 5 suggestions
        metadata: { 
          processingTime: Date.now() - startTime,
          totalSuggestions: suggestions.length
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Category suggestion failed: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime: Date.now() - startTime }
      };
    }
  }

  async updateCategoryModel(feedback: Array<{
    transaction: any;
    expectedCategory: string;
    actualCategory: string;
    confidence: number;
  }>): Promise<GatewayResult<void>> {
    const startTime = Date.now();

    try {
      // For now, just log the feedback
      // In a production system, this would update ML model weights or training data
      console.log('Received category feedback for model improvement:', {
        feedbackCount: feedback.length,
        timestamp: new Date().toISOString()
      });

      // TODO: Implement model feedback mechanism
      // This could involve:
      // 1. Storing feedback in a database
      // 2. Periodically retraining the model
      // 3. Adjusting classification rules based on feedback

      return {
        success: true,
        data: undefined,
        metadata: { 
          processingTime: Date.now() - startTime,
          feedbackProcessed: feedback.length
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Model update failed: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime: Date.now() - startTime }
      };
    }
  }

  private initializeClassifier(): void {
    try {
      // Create adapter to bridge interface mismatch between ExpenseClassifier and LLMExtractionGateway
      // ExpenseClassifier expects: extractData(prompt: string)
      // LLMExtractionGateway expects: extractData({prompt, text, format})
      const adaptedExtractor = {
        config: this.llmExtractor.config,
        extractData: async (prompt: string) => {
          const result = await this.llmExtractor.extractData({
            prompt: prompt,
            text: 'Classification request',
            format: 'json'
          });
          
          if (!result.success) {
            throw new Error(result.error || 'LLM extraction failed');
          }
          
          return result.data.extractedData;
        }
      };

      const { ExpenseClassifier } = require('../../classifiers/expense-classifier');
      this.classifier = new ExpenseClassifier(adaptedExtractor);
    } catch (error) {
      throw new Error(`Failed to initialize expense classifier: ${error instanceof Error ? error.message : error}`);
    }
  }

  private calculateAverageConfidence(categorizedTransactions: any[], categoryName: string): number {
    const categoryTransactions = categorizedTransactions.filter(ctx => ctx.category === categoryName);
    
    if (categoryTransactions.length === 0) {
      return 0;
    }

    const totalConfidence = categoryTransactions.reduce((sum, ctx) => sum + ctx.confidence, 0);
    return totalConfidence / categoryTransactions.length;
  }

  private getDefaultCategories(): any[] {
    return [
      {
        name: "Alimentación",
        tags: ["#supermercado", "#restaurantes", "#delivery", "#cafe", "#snacks"],
        description: "Comida y bebidas"
      },
      {
        name: "Transporte",
        tags: ["#combustible", "#transporte_publico", "#uber", "#taxi", "#peajes", "#mantenimiento_auto"],
        description: "Transporte y vehículos"
      },
      {
        name: "Hogar",
        tags: ["#alquiler", "#expensas", "#luz", "#gas", "#agua", "#internet"],
        description: "Gastos relacionados con la vivienda"
      },
      {
        name: "Ocio y Entretenimiento",
        tags: ["#salidas", "#streaming", "#cine", "#eventos", "#juegos"],
        description: "Entretenimiento y recreación"
      },
      {
        name: "Salud",
        tags: ["#obra_social", "#seguro_medico", "#medicamentos", "#consultas_medicas"],
        description: "Gastos médicos y de salud"
      },
      {
        name: "Compras Personales",
        tags: ["#ropa", "#tecnologia", "#accesorios"],
        description: "Compras personales y ropa"
      },
      {
        name: "Otros",
        tags: ["#varios", "#miscelaneos"],
        description: "Gastos varios no categorizados"
      }
    ];
  }
}