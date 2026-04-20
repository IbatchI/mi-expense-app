/**
 * Expense Categorization Use Case Implementation
 * 
 * Categorizes transactions into Spanish expense categories using LLM analysis.
 * Provides confidence scores and category breakdown for financial insights.
 */

import { 
  IExpenseCategorializationUseCase,
  ExpenseCategorializationRequest,
  UseCaseResult
} from '../interfaces';
import { ILoggingGateway } from '../gateways/interfaces';
import { ICategoryRepository } from '../repositories/interfaces';
import { CATEGORY_DESIGNS } from '../../shared/constants/category-designs';
import { LLMGatewayFactory } from '../../adapters/gateways/llm-gateway.factory';
import { ExpenseClassificationGateway } from '../../adapters/gateways/expense-classification.gateway';

export class ExpenseCategorializationUseCase implements IExpenseCategorializationUseCase {
  constructor(
    private readonly categoryRepository: ICategoryRepository,
    private readonly logger: ILoggingGateway
  ) {}

  async categorizeExpenses(request: ExpenseCategorializationRequest): Promise<UseCaseResult<any>> {
    const startTime = Date.now();

    try {
      // Validate input
      if (!request.statementData) {
        return {
          success: false,
          error: 'Statement data is required',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      if (!request.statementData.transactions || !Array.isArray(request.statementData.transactions)) {
        return {
          success: false,
          error: 'Statement must contain transactions array',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      if (request.statementData.transactions.length === 0) {
        this.logger.warn('No transactions to categorize');
        return {
          success: true,
          data: {
            ...request.statementData,
            transactions: [],
            categoryBreakdown: {},
            classificationMetadata: {
              processingTime: Date.now() - startTime,
              totalTransactions: 0,
              categorizedTransactions: 0,
              uncategorizedTransactions: 0
            }
          },
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      this.logger.info('Starting expense categorization', {
        transactionCount: request.statementData.transactions.length,
        provider: request.extractorConfig.provider
      });

      // Create LLM gateway for this specific request
      const llmGateway = LLMGatewayFactory.createFromExtractorConfig(request.extractorConfig);
      
      // Create expense classification gateway with the LLM gateway
      const expenseClassificationGateway = new ExpenseClassificationGateway(llmGateway);

      // Get available categories
      const categoriesResult = await this.categoryRepository.findAll();
      let categories: any[] = [];

      if (categoriesResult.success && categoriesResult.data) {
        categories = categoriesResult.data.map(cat => ({
          name: cat.name,
          tags: cat.tags,
          description: cat.description
        }));
      } else {
        // Fallback to built-in categories
        categories = this.getBuiltInCategories();
        this.logger.warn('Using built-in categories (repository unavailable)', {
          error: categoriesResult.error
        });
      }

      this.logger.debug('Categories loaded', {
        categoryCount: categories.length,
        categoryNames: categories.map(c => c.name)
      });

      // Exclude payment transactions before classification — they are credit card payments,
      // not expenses, and should not be categorized.
      const paymentTransactions = request.statementData.transactions.filter(
        (tx: any) => tx.type === 'payment'
      );
      const transactionsToClassify = request.statementData.transactions.filter(
        (tx: any) => tx.type !== 'payment'
      );

      if (paymentTransactions.length > 0) {
        this.logger.debug('Payment transactions excluded from classification', {
          count: paymentTransactions.length,
          descriptions: paymentTransactions.map((tx: any) => tx.description || tx.merchant)
        });
      }

      // Classify expenses using the gateway
      const classificationResult = await expenseClassificationGateway.classifyExpenses({
        transactions: transactionsToClassify,
        categories: categories,
        options: {
          confidenceThreshold: 0.3, // Lower threshold for Spanish categories
          allowMultipleCategories: false,
          includeReasons: true
        }
      });

      if (!classificationResult.success || !classificationResult.data) {
        return {
          success: false,
          error: `Expense classification failed: ${classificationResult.error}`,
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      const classifiedData = classificationResult.data;

      // Enhance categorized transactions with category designs.
      // classifiedData.categorizedTransactions already contains ALL transactions
      // (including those mapped to "Sin Categoría") — do NOT add uncategorizedTransactions
      // on top of them or they will be duplicated.
      const enhancedTransactions = classifiedData.categorizedTransactions.map((ctx: any) => ({
        ...ctx.transaction,
        category: ctx.category,
        confidence: ctx.confidence,
        tags: ctx.tags,
        reasoning: ctx.reasoning,
        categoryDesign: this.getCategoryDesign(ctx.category)
      }));

      // Re-include payment transactions that were excluded from classification (pass-through)
      const allTransactions = [
        ...enhancedTransactions,
        ...paymentTransactions
      ];

      // Calculate enhanced category breakdown with Money objects and percentages
      const categoryBreakdown = this.calculateCategoryBreakdown(enhancedTransactions);

      // Create final result
      const result = {
        ...request.statementData,
        transactions: allTransactions,
        categoryBreakdown: categoryBreakdown,
        classificationMetadata: {
          processingTime: Date.now() - startTime,
          totalTransactions: transactionsToClassify.length,
          categorizedTransactions: enhancedTransactions.length,
          uncategorizedTransactions: classifiedData.uncategorizedTransactions.length,
          provider: request.extractorConfig.provider,
          model: request.extractorConfig.model,
          categories: categories.map(c => c.name)
        }
      };

      this.logger.info('Expense categorization completed', {
        totalTransactions: result.classificationMetadata.totalTransactions,
        categorizedTransactions: result.classificationMetadata.categorizedTransactions,
        uncategorizedTransactions: result.classificationMetadata.uncategorizedTransactions,
        categorizationRate: (result.classificationMetadata.categorizedTransactions / result.classificationMetadata.totalTransactions * 100).toFixed(1),
        categoriesFound: Object.keys(categoryBreakdown).length,
        processingTime: Date.now() - startTime
      });

      return {
        success: true,
        data: result,
        metadata: {
          processingTime: Date.now() - startTime,
          categorizedCount: enhancedTransactions.length,
          uncategorizedCount: classifiedData.uncategorizedTransactions.length,
          categorizationRate: transactionsToClassify.length > 0
            ? enhancedTransactions.length / transactionsToClassify.length
            : 0
        }
      };

    } catch (error) {
      this.logger.error('Expense categorization error', {
        error: error instanceof Error ? error.message : error,
        transactionCount: request.statementData?.transactions?.length || 0
      });

      return {
        success: false,
        error: `Expense categorization failed: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime: Date.now() - startTime }
      };
    }
  }

  private getBuiltInCategories(): any[] {
    return [
      {
        name: "Hogar",
        tags: ["#alquiler", "#expensas", "#luz", "#gas", "#agua", "#internet"],
        description: "Gastos relacionados con la vivienda"
      },
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
        name: "Ocio y Entretenimiento",
        tags: ["#salidas", "#streaming", "#cine", "#eventos", "#juegos", "#juguetes", "#infantil"],
        description: "Entretenimiento y recreación"
      },
      {
        name: "Viajes",
        tags: ["#viajes", "#hotel", "#vuelo", "#excursion", "#turismo", "#alojamiento", "#tour", "#transporte_largo", "#parques_nacionales", "#aventura"],
        description: "Viajes, alojamiento, vuelos, excursiones y turismo"
      },
      {
        name: "Salud",
        tags: ["#obra_social", "#seguro_medico", "#medicamentos", "#consultas_medicas"],
        description: "Gastos médicos y de salud"
      },
      {
        name: "Belleza y Cuidado Personal",
        tags: ["#perfumeria", "#cosmetica", "#peluqueria", "#maquillaje", "#estetica", "#spa", "#cuidado_personal"],
        description: "Perfumerías, cosméticos, peluquerías y cuidado personal"
      },
      {
        name: "Indumentaria",
        tags: ["#ropa", "#calzado", "#accesorios_moda", "#indumentaria", "#moda", "#vestimenta"],
        description: "Ropa, calzado y accesorios de moda"
      },
      {
        name: "Compras Personales",
        tags: ["#tecnologia", "#electronica", "#hogar_deco", "#accesorios"],
        description: "Electrónica, artículos para el hogar y compras generales"
      },
      {
        name: "Educación",
        tags: ["#cursos", "#libros", "#suscripciones_educativas"],
        description: "Educación y formación"
      },
      {
        name: "Mascotas",
        tags: ["#alimento_mascota", "#veterinario"],
        description: "Cuidado de mascotas"
      },
      {
        name: "Trabajo / Negocio",
        tags: ["#gastos_laborales", "#herramientas", "#materiales"],
        description: "Gastos relacionados con el trabajo"
      },
      {
        name: "Otros",
        tags: ["#varios", "#miscelaneos"],
        description: "Gastos varios no categorizados"
      }
    ];
  }

  private getCategoryDesign(categoryName: string): any {
    // Find category design from constants
    const design = CATEGORY_DESIGNS[categoryName];
    
    if (design) {
      return {
        icon: design.icon,
        color: design.color
      };
    }

    // Default design for unknown categories
    return {
      icon: 'shopping-bag',
      color: '#6B7280'
    };
  }

  private calculateCategoryBreakdown(categorizedTransactions: any[]): any {
    const breakdown: { [categoryName: string]: { total: number; count: number; currency: string; } } = {};
    
    // Calculate totals by category (expenses and discounts, exclude payments)
    const relevantTransactions = categorizedTransactions.filter(tx => {
      return tx.type !== 'payment'; // Exclude actual credit card payments
    });

    const totalAmount = relevantTransactions.reduce((sum, tx) => {
      const amount = tx.amount || tx.amountPesos || 0;
      return sum + amount;
    }, 0);

    for (const transaction of relevantTransactions) {
      const categoryName = transaction.category;
      const amount = transaction.amount || transaction.amountPesos || 0;
      const currency = transaction.currency || (transaction.amountDollars > 0 ? 'USD' : 'ARS');

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

    // Convert to final format with percentages
    const result: any = {};
    for (const [categoryName, data] of Object.entries(breakdown)) {
      const percentage = totalAmount > 0 ? (data.total / totalAmount) * 100 : 0;
      const avgAmount = data.count > 0 ? data.total / data.count : 0;
      
      result[categoryName] = {
        total: data.total,
        count: data.count,
        percentage: Math.round(percentage * 10) / 10, // Round to 1 decimal
        averageAmount: Math.round(avgAmount * 100) / 100 // Round to 2 decimals
      };
    }

    return result;
  }
}