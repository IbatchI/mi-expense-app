/**
 * Text Preprocessor Gateway Implementation
 * 
 * Applies bank-specific text preprocessing rules to clean PDF text.
 * Refactored from the original preprocessor classes to use the gateway pattern.
 */

import { ITextPreprocessorGateway, GatewayResult, PreprocessingResult } from '../../use-cases/gateways/interfaces';

export class TextPreprocessorGateway implements ITextPreprocessorGateway {
  private readonly availablePreprocessors = ['galicia', 'pampa', 'generic'];

  async preprocess(rawText: string, bankType: string): Promise<GatewayResult<PreprocessingResult>> {
    const startTime = Date.now();

    try {
      if (!rawText || rawText.trim().length === 0) {
        return {
          success: false,
          error: 'Raw text cannot be empty',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      const normalizedBankType = bankType.toLowerCase().trim();

      let preprocessingResult: PreprocessingResult;

      switch (normalizedBankType) {
        case 'galicia':
          preprocessingResult = await this.preprocessGalicia(rawText);
          break;
        case 'pampa':
          preprocessingResult = await this.preprocessPampa(rawText);
          break;
        default:
          preprocessingResult = await this.preprocessGeneric(rawText);
          break;
      }

      return {
        success: true,
        data: preprocessingResult,
        metadata: {
          processingTime: Date.now() - startTime,
          bankType: normalizedBankType,
          originalLength: rawText.length,
          cleanedLength: preprocessingResult.cleanedText.length,
          compressionRatio: 1 - (preprocessingResult.cleanedText.length / rawText.length)
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Preprocessing failed: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime: Date.now() - startTime }
      };
    }
  }

  getAvailablePreprocessors(): string[] {
    return [...this.availablePreprocessors];
  }

  validateTextQuality(text: string): GatewayResult<{
    quality: 'high' | 'medium' | 'low';
    issues: string[];
    suggestions: string[];
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: 'Text cannot be empty'
      };
    }

    const textLength = text.length;
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const lines = text.split('\n').filter(l => l.trim().length > 0);

    // Check text length
    if (textLength < 100) {
      issues.push('Text is very short');
      suggestions.push('Ensure the PDF contains sufficient content');
    }

    // Check for garbled text (too many special characters)
    const specialCharsRatio = (text.match(/[^\w\s]/g) || []).length / textLength;
    if (specialCharsRatio > 0.3) {
      issues.push('High ratio of special characters detected');
      suggestions.push('PDF may be poorly scanned or contains non-text elements');
    }

    // Check for readable content
    const readableWordsRatio = words.filter(w => /^[a-zA-ZÀ-ÿ\u00f1\u00d1]+$/.test(w)).length / words.length;
    if (readableWordsRatio < 0.3) {
      issues.push('Low ratio of readable words');
      suggestions.push('PDF may contain mostly numbers, codes, or corrupted text');
    }

    // Check line structure
    if (lines.length < 5) {
      issues.push('Very few text lines detected');
      suggestions.push('PDF may not have proper text structure');
    }

    // Check for common credit card statement indicators
    const hasAccountNumber = /account|cuenta|número|numero/i.test(text);
    const hasDates = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(text);
    const hasAmounts = /\$\s*\d+[,.]?\d*|\d+[,.]\d{2}/.test(text);

    if (!hasAccountNumber && !hasDates && !hasAmounts) {
      issues.push('No typical credit card statement patterns found');
      suggestions.push('Verify this is a credit card statement PDF');
    }

    // Determine quality
    let quality: 'high' | 'medium' | 'low';
    if (issues.length === 0) {
      quality = 'high';
    } else if (issues.length <= 2) {
      quality = 'medium';
    } else {
      quality = 'low';
    }

    return {
      success: true,
      data: { quality, issues, suggestions }
    };
  }

  private async preprocessGalicia(rawText: string): Promise<PreprocessingResult> {
    // Import the existing Galicia preprocessor
    const { GaliciaTextPreprocessor } = require('../../preprocessors/galicia-text.preprocessor');
    const preprocessor = new GaliciaTextPreprocessor();
    
    const result = preprocessor.preprocess(rawText);
    
    return {
      cleanedText: result.cleanedText,
      extractedData: result.extractedData,
      removedSections: result.removedSections || [],
      appliedRules: result.appliedRules || [
        'Remove headers and footers',
        'Extract transaction data',
        'Clean monetary amounts',
        'Normalize date formats'
      ]
    };
  }

  private async preprocessPampa(rawText: string): Promise<PreprocessingResult> {
    // Enhanced Pampa preprocessing with specific pattern extraction
    const cleanedText = this.applyGenericCleaning(rawText);
    
    // Extract key Pampa-specific patterns for better LLM processing
    const extractedData = this.extractPampaPatterns(cleanedText);
    
    return {
      cleanedText: this.enhancePampaText(cleanedText),
      extractedData,
      removedSections: [
        'Page headers',
        'Page footers', 
        'Advertising content',
        'Legal disclaimers'
      ],
      appliedRules: [
        'Generic text cleaning',
        'Pampa-specific pattern extraction',
        'Transaction format standardization',
        'Date format enhancement',
        'Amount format normalization'
      ]
    };
  }

  private extractPampaPatterns(text: string): any {
    const patterns = {
      holder: null as string | null,
      accountNumber: null as string | null,
      currentDueDate: null as string | null,
      currentClosing: null as string | null,
      previousClosing: null as string | null,
      previousDueDate: null as string | null,
      currentBalance: null as string | null,
      minimumPayment: null as string | null,
      transactionCount: 0
    };

    // Extract holder (TITULAR DE CUENTA)
    const holderMatch = text.match(/TITULAR DE CUENTA:\s*\n\s*([A-Z\s]+)/);
    if (holderMatch) {
      patterns.holder = holderMatch[1].trim();
    }

    // Extract account number (N DE CUENTA)
    const accountMatch = text.match(/N DE CUENTA:\s*\n\s*(\d+)/);
    if (accountMatch) {
      patterns.accountNumber = accountMatch[1];
    }

    // Extract current due date (Vencimiento actual)
    const currentDueMatch = text.match(/Vencimiento actual:\s*(\d{2}\s+\w{3}\.\s+\d{2})/);
    if (currentDueMatch) {
      patterns.currentDueDate = currentDueMatch[1];
    }

    // Extract current closing (Cierre actual)
    const currentClosingMatch = text.match(/Cierre actual:\s*(\d{2}\s+\w{3}\.\s+\d{2})/);
    if (currentClosingMatch) {
      patterns.currentClosing = currentClosingMatch[1];
    }

    // Extract previous closing (Cierre anterior)
    const previousClosingMatch = text.match(/Cierre anterior:\s*(\d{2}\s+\w{3}\.\s+\d{2})/);
    if (previousClosingMatch) {
      patterns.previousClosing = previousClosingMatch[1];
    }

    // Extract previous due date (Vencimiento anterior)
    const previousDueMatch = text.match(/Vencimiento anterior:\s*(\d{2}\s+\w{3}\.\s+\d{2})/);
    if (previousDueMatch) {
      patterns.previousDueDate = previousDueMatch[1];
    }

    // Extract current balance (SALDO ACTUAL)
    const balanceMatch = text.match(/SALDO ACTUAL\s*\$\s*([\d.,]+)/);
    if (balanceMatch) {
      patterns.currentBalance = balanceMatch[1];
    }

    // Extract minimum payment (PAGO MINIMO)
    const minPaymentMatch = text.match(/PAGO MINIMO\s*\$\s*([\d.,]+)/);
    if (minPaymentMatch) {
      patterns.minimumPayment = minPaymentMatch[1];
    }

    // Count transactions (lines with date patterns)
    const transactionMatches = text.match(/\d{2}-\d{2}-\d{2}.*?[\d.,]+/g);
    if (transactionMatches) {
      patterns.transactionCount = transactionMatches.length;
    }

    return patterns;
  }

  private enhancePampaText(text: string): string {
    return text
      // Normalize date formats for better LLM parsing
      .replace(/(\d{2})-(\d{2})-(\d{2})/g, '$1-$2-20$3') // Convert YY to 20YY
      // Normalize amount formats
      .replace(/\$\s*([\d.,]+)/g, '$ $1')
      // Enhance transaction line formatting
      .replace(/(\d{2}-\d{2}-\d{4})\s+(\d+)?\s*([A-Z\s]+?)\s+(C\.\d+\/\d+)?\s*([\d.,]+)/g, 
        'TRANSACTION: $1 | $3 | $4 | $5')
      // Mark key sections clearly for LLM
      .replace(/TITULAR DE CUENTA:/, '\n=== TITULAR DE CUENTA ===')
      .replace(/N DE CUENTA:/, '\n=== NUMERO DE CUENTA ===')
      .replace(/Vencimiento actual:/, '\n=== VENCIMIENTO ACTUAL ===')
      .replace(/Cierre actual:/, '\n=== CIERRE ACTUAL ===')
      .replace(/Cierre anterior:/, '\n=== CIERRE ANTERIOR ===')
      .replace(/Vencimiento anterior:/, '\n=== VENCIMIENTO ANTERIOR ===')
      .replace(/SALDO ACTUAL/, '\n=== SALDO ACTUAL ===')
      .replace(/PAGO MINIMO/, '\n=== PAGO MINIMO ===')
      .replace(/FECHACOMPROBANTEDETALLE/, '\n=== INICIO TRANSACCIONES ===\nFECHA | COMPROBANTE | DETALLE');
  }

  private async preprocessGeneric(rawText: string): Promise<PreprocessingResult> {
    const cleanedText = this.applyGenericCleaning(rawText);
    
    return {
      cleanedText,
      extractedData: null,
      removedSections: [
        'Page headers',
        'Page footers'
      ],
      appliedRules: [
        'Generic text cleaning',
        'Remove excessive whitespace',
        'Normalize line endings'
      ]
    };
  }

  private applyGenericCleaning(text: string): string {
    return text
      // 🔧 QUIRÚRGICO: Remover solo caracteres de control problemáticos
      // Preservar: \u0009 (Tab) y \u000a (LF) que son válidos
      // Remover: \u0001-\u0007 que causan problemas con LLM
      .replace(/[\u0001-\u0007]/g, '')
      // Remove excessive whitespace
      .replace(/[ \t]+/g, ' ')
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove multiple consecutive newlines
      .replace(/\n{3,}/g, '\n\n')
      // Remove leading/trailing whitespace from lines
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      // Remove empty lines at start/end
      .trim();
  }
}