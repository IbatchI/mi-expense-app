/**
 * Statement Presenter
 * 
 * Formats statement data for frontend consumption with optimized response structure,
 * category designs, and complete information to minimize API calls.
 */

import { ExpenseStatement } from '../../domain/entities/expense-statement.entity';
import { Transaction } from '../../domain/entities/transaction.entity';
import { CATEGORY_DESIGNS } from '../../shared/constants/category-designs';

export interface PresentedStatement {
  id: string;
  holder: string;
  accountNumber: string;
  bank: string;
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
    pesos: {
      amount: number;
      formatted: string;
      currency: string;
    };
    dollars: {
      amount: number;
      formatted: string;
      currency: string;
    };
    minimumPayment: {
      amount: number;
      formatted: string;
      currency: string;
    };
  };
  transactions: PresentedTransaction[];
  categoryBreakdown: PresentedCategoryBreakdown;
  analytics: {
    totalExpenses: {
      amount: number;
      formatted: string;
      currency: string;
    };
    stats: {
      totalTransactions: number;
      expenseTransactions: number;
      categorizedTransactions: number;
      uncategorizedTransactions: number;
      categorizationPercentage: number;
      totalCategories: number;
    };
  };
  metadata?: {
    processingTime: number;
    provider: string;
    model: string;
    extractionSuccess: boolean;
    classificationSuccess: boolean;
  };
}

export interface PresentedTransaction {
  id: string;
  date: string;
  description: string;
  merchant: string;
  amount: {
    value: number;
    currency: string;
    formatted: string;
  };
  type: string;
  installments?: string;
  reference?: string;
  voucher?: string;
  category?: {
    name: string;
    englishName: string;
    icon: string;
    color: string;
    lightColor: string;
    textColor: string;
    confidence: number;
  };
  tags: string[];
}

export interface PresentedCategoryBreakdown {
  [categoryName: string]: {
    total: {
      amount: number;
      formatted: string;
      currency: string;
    };
    count: number;
    percentage: number;
    averageAmount: {
      amount: number;
      formatted: string;
      currency: string;
    };
    design: {
      icon: string;
      color: string;
      lightColor: string;
      textColor: string;
    };
  };
}

export class StatementPresenter {
  /**
   * Present a complete statement for frontend consumption
   */
  static present(statement: ExpenseStatement): PresentedStatement {
    const frontendData = statement.toFrontendFormat();
    
    const result: PresentedStatement = {
      id: frontendData.id,
      holder: frontendData.holder,
      accountNumber: frontendData.accountNumber,
      bank: frontendData.bank,
      period: frontendData.period,
      totals: {
        pesos: {
          amount: frontendData.totals.pesos.amount,
          formatted: frontendData.totals.pesos.formatted,
          currency: 'ARS'
        },
        dollars: {
          amount: frontendData.totals.dollars.amount,
          formatted: frontendData.totals.dollars.formatted,
          currency: 'USD'
        },
        minimumPayment: {
          amount: frontendData.totals.minimumPayment.amount,
          formatted: frontendData.totals.minimumPayment.formatted,
          currency: 'ARS'
        }
      },
      transactions: this.presentTransactions(statement.transactions),
      categoryBreakdown: this.presentCategoryBreakdown(statement.categoryBreakdown),
      analytics: {
        totalExpenses: this.presentMoney(statement.getTotalExpenses()),
        stats: frontendData.stats
      }
    };

    // Add metadata if available
    if (frontendData.metadata) {
      result.metadata = {
        processingTime: frontendData.metadata.processingTime,
        provider: frontendData.metadata.provider,
        model: frontendData.metadata.model,
        extractionSuccess: frontendData.metadata.extractionSuccess,
        classificationSuccess: frontendData.metadata.classificationSuccess
      };
    }

    return result;
  }

  /**
   * Present transactions with enhanced category information
   */
  private static presentTransactions(transactions: readonly Transaction[]): PresentedTransaction[] {
    return transactions.map(tx => {
      const frontendTx = tx.toFrontendFormat();
      
      const presentedTx: PresentedTransaction = {
        id: frontendTx.id,
        date: frontendTx.date,
        description: frontendTx.description,
        merchant: frontendTx.merchant,
        amount: frontendTx.amount,
        type: frontendTx.type,
        tags: frontendTx.tags
      };

      // Add optional fields if present
      if (frontendTx.installments) {
        presentedTx.installments = frontendTx.installments;
      }
      if (frontendTx.reference) {
        presentedTx.reference = frontendTx.reference;
      }
      if (frontendTx.voucher) {
        presentedTx.voucher = frontendTx.voucher;
      }

      // Enhance category with full design information
      if (frontendTx.category) {
        const categoryDesign = CATEGORY_DESIGNS[frontendTx.category.name];
        
        presentedTx.category = {
          name: frontendTx.category.name,
          englishName: frontendTx.category.englishName,
          icon: categoryDesign ? categoryDesign.icon : frontendTx.category.icon,
          color: categoryDesign ? categoryDesign.color : frontendTx.category.color,
          lightColor: categoryDesign ? categoryDesign.lightColor : this.lightenColor(frontendTx.category.color),
          textColor: categoryDesign ? categoryDesign.textColor : '#FFFFFF',
          confidence: frontendTx.category.confidence
        };
      }

      return presentedTx;
    });
  }

  /**
   * Present category breakdown with design information
   */
  private static presentCategoryBreakdown(categoryBreakdown?: any): PresentedCategoryBreakdown {
    if (!categoryBreakdown) {
      return {};
    }

    const presented: PresentedCategoryBreakdown = {};

    for (const [categoryName, breakdown] of Object.entries(categoryBreakdown)) {
      const data = breakdown as any;
      const categoryDesign = CATEGORY_DESIGNS[categoryName];

      presented[categoryName] = {
        total: {
          amount: data.total.amount || data.total,
          formatted: data.total.formatted || this.formatAmount(data.total),
          currency: data.total.currency || 'ARS'
        },
        count: data.count,
        percentage: data.percentage,
        averageAmount: {
          amount: data.averageAmount.amount || data.averageAmount,
          formatted: data.averageAmount.formatted || this.formatAmount(data.averageAmount),
          currency: data.averageAmount.currency || 'ARS'
        },
        design: {
          icon: categoryDesign ? categoryDesign.icon : '🏷️',
          color: categoryDesign ? categoryDesign.color : '#6B7280',
          lightColor: categoryDesign ? categoryDesign.lightColor : '#F3F4F6',
          textColor: categoryDesign ? categoryDesign.textColor : '#FFFFFF'
        }
      };
    }

    return presented;
  }

  /**
   * Present a Money object with consistent formatting
   */
  private static presentMoney(money: any): {
    amount: number;
    formatted: string;
    currency: string;
  } {
    return {
      amount: money.getValue ? money.getValue() : money.amount,
      formatted: money.format ? money.format() : this.formatAmount(money.amount || money),
      currency: money.getCurrency ? money.getCurrency() : money.currency || 'ARS'
    };
  }

  /**
   * Format amount as currency string
   */
  private static formatAmount(amount: number, currency: string = 'ARS'): string {
    try {
      const formatter = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2
      });
      return formatter.format(amount);
    } catch {
      // Fallback formatting
      return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ${currency}`;
    }
  }

  /**
   * Lighten a hex color for background use
   */
  private static lightenColor(hex: string, percent: number = 0.8): string {
    // Remove # if present
    const color = hex.replace('#', '');
    
    // Parse RGB values
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    
    // Lighten by blending with white
    const lightenedR = Math.round(r + (255 - r) * percent);
    const lightenedG = Math.round(g + (255 - g) * percent);
    const lightenedB = Math.round(b + (255 - b) * percent);
    
    // Convert back to hex
    const toHex = (n: number) => {
      const hex = n.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    return `#${toHex(lightenedR)}${toHex(lightenedG)}${toHex(lightenedB)}`;
  }
}

/**
 * Processing Result Presenter
 * 
 * Formats processing results with detailed progress information
 */
export interface PresentedProcessingResult {
  success: boolean;
  statement?: PresentedStatement;
  processingDetails: {
    steps: ProcessingStep[];
    totalTime: number;
    bankDetection: {
      bank: string;
      confidence: number;
      patterns: string[];
    };
    extraction: {
      provider: string;
      model: string;
      tokensUsed?: number;
      confidence: number;
    };
    categorization: {
      categorizedCount: number;
      uncategorizedCount: number;
      categorizationRate: number;
    };
  };
  error?: string;
  warnings?: string[];
  recommendations?: string[];
}

export interface ProcessingStep {
  name: string;
  status: 'success' | 'warning' | 'error';
  duration: number;
  details: string;
  warnings?: string[];
}

export class ProcessingResultPresenter {
  static present(
    result: any,
    processingSteps: ProcessingStep[]
  ): PresentedProcessingResult {
    const response: PresentedProcessingResult = {
      success: result.success,
      processingDetails: {
        steps: processingSteps,
        totalTime: result.metadata?.processingTime || 0,
        bankDetection: {
          bank: result.data?.processingDetails?.bankDetection?.bank || 'unknown',
          confidence: result.data?.processingDetails?.bankDetection?.confidence || 0,
          patterns: result.data?.processingDetails?.bankDetection?.patterns || []
        },
        extraction: {
          provider: result.metadata?.extractionProvider || 'unknown',
          model: result.data?.processingDetails?.extraction?.model || 'unknown',
          tokensUsed: result.data?.processingDetails?.extraction?.tokensUsed,
          confidence: result.data?.processingDetails?.extraction?.confidence || 0
        },
        categorization: {
          categorizedCount: result.data?.processingDetails?.categorization?.categorizedTransactions || 0,
          uncategorizedCount: result.data?.processingDetails?.categorization?.uncategorizedTransactions || 0,
          categorizationRate: 0
        }
      }
    };

    // Calculate categorization rate
    const total = response.processingDetails.categorization.categorizedCount + 
                 response.processingDetails.categorization.uncategorizedCount;
    if (total > 0) {
      response.processingDetails.categorization.categorizationRate = 
        response.processingDetails.categorization.categorizedCount / total;
    }

    // Add statement if successful
    if (result.success && result.data?.statement) {
      response.statement = StatementPresenter.present(result.data.statement);
    }

    // Add error if failed
    if (!result.success) {
      response.error = result.error;
    }

    // Add warnings and recommendations
    response.warnings = this.extractWarnings(processingSteps, result);
    response.recommendations = this.generateRecommendations(result, processingSteps);

    return response;
  }

  private static extractWarnings(steps: ProcessingStep[], result: any): string[] {
    const warnings: string[] = [];

    // Collect warnings from processing steps
    for (const step of steps) {
      if (step.warnings) {
        warnings.push(...step.warnings);
      }
    }

    // Add confidence-based warnings
    const bankConfidence = result.data?.processingDetails?.bankDetection?.confidence || 0;
    if (bankConfidence < 0.8) {
      warnings.push(`Low bank detection confidence (${(bankConfidence * 100).toFixed(1)}%)`);
    }

    const extractionConfidence = result.data?.processingDetails?.extraction?.confidence || 0;
    if (extractionConfidence < 0.7) {
      warnings.push(`Low extraction confidence (${(extractionConfidence * 100).toFixed(1)}%)`);
    }

    return warnings;
  }

  private static generateRecommendations(result: any, steps: ProcessingStep[]): string[] {
    const recommendations: string[] = [];

    // Bank detection recommendations
    const bankConfidence = result.data?.processingDetails?.bankDetection?.confidence || 0;
    if (bankConfidence < 0.5) {
      recommendations.push('Consider manually verifying the detected bank');
      recommendations.push('Check if this is a supported bank statement format');
    }

    // Categorization recommendations
    const categorizationRate = result.data?.processingDetails?.categorization?.categorizationRate || 0;
    if (categorizationRate < 0.6) {
      recommendations.push('Review uncategorized transactions for manual categorization');
      recommendations.push('Consider training the system with more category examples');
    }

    // Performance recommendations
    const totalTime = result.metadata?.processingTime || 0;
    if (totalTime > 30000) { // More than 30 seconds
      recommendations.push('Processing time was high - consider optimizing PDF quality');
    }

    // Error-based recommendations
    const hasErrors = steps.some(step => step.status === 'error');
    if (hasErrors) {
      recommendations.push('Some processing steps failed - check PDF quality and content');
    }

    return recommendations;
  }
}