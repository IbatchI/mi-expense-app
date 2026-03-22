/**
 * Bank Detection Gateway Implementation
 * 
 * Detects the bank type from PDF text using pattern matching algorithms.
 * Refactored from the original BankDetector class to use the gateway pattern.
 */

import { IBankDetectionGateway, GatewayResult } from '../../use-cases/gateways/interfaces';

interface BankPattern {
  bank: string;
  patterns: string[];
  weight: number;
}

export class BankDetectionGateway implements IBankDetectionGateway {
  private readonly bankPatterns: BankPattern[] = [
    {
      bank: 'galicia',
      patterns: [
        'BANCO GALICIA',
        'GALICIA',
        'VISA GALICIA',
        'MASTERCARD GALICIA',
        'www.galicia.com',
        'GALICIA Y BUENOS AIRES S.A.',
        'Banco de Galicia y Buenos Aires'
      ],
      weight: 1.0
    },
    {
      bank: 'pampa',
      patterns: [
        // Shared patterns
        'BANCO DE LA PAMPA',
        'BANCO PAMPA',
        'PAMPA',
        'www.bancopampa.com.ar',
        // VISA-specific patterns
        'VISA PAMPA',
        'PAMPA BANCO',
        // MasterCard-specific patterns
        'MASTERCARD PAMPA',
        'CUIT ENTIDAD 30-99907583-1',   // CUIT entidad emisora (MC Pampa)
        '0800-222-3485',                 // Gold Line exclusivo MC Pampa
        'MASTERCARD GOLD',               // Encabezado del resumen MC Pampa
      ],
      weight: 1.0
    },
    {
      bank: 'santander',
      patterns: [
        'BANCO SANTANDER',
        'SANTANDER RIO',
        'SANTANDER',
        'www.santander.com.ar'
      ],
      weight: 1.0
    },
    {
      bank: 'frances',
      patterns: [
        'BANCO FRANCES',
        'BBVA FRANCES',
        'BBVA',
        'www.bbva.com.ar'
      ],
      weight: 1.0
    },
    {
      bank: 'macro',
      patterns: [
        'BANCO MACRO',
        'MACRO',
        'www.macro.com.ar'
      ],
      weight: 1.0
    },
    {
      bank: 'icbc',
      patterns: [
        'ICBC',
        'INDUSTRIAL AND COMMERCIAL BANK',
        'www.icbc.com.ar'
      ],
      weight: 1.0
    }
  ];

  private customPatterns: Map<string, string[]> = new Map();

  async detectBank(text: string): Promise<GatewayResult<{
    bank: string;
    confidence: number;
    patterns: string[];
  }>> {
    const startTime = Date.now();

    try {
      if (!text || text.trim().length === 0) {
        return {
          success: false,
          error: 'Text cannot be empty',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      // Normalize text for better matching
      const normalizedText = this.normalizeText(text);

      // Calculate scores for each bank
      const bankScores = new Map<string, { score: number; matchedPatterns: string[] }>();

      // Check built-in patterns
      for (const bankPattern of this.bankPatterns) {
        const result = this.calculateBankScore(normalizedText, bankPattern);
        if (result.score > 0) {
          bankScores.set(bankPattern.bank, result);
        }
      }

      // Check custom patterns
      for (const [bank, patterns] of this.customPatterns.entries()) {
        const customPattern: BankPattern = { bank, patterns, weight: 1.0 };
        const result = this.calculateBankScore(normalizedText, customPattern);
        if (result.score > 0) {
          const existing = bankScores.get(bank);
          if (existing) {
            existing.score += result.score;
            existing.matchedPatterns.push(...result.matchedPatterns);
          } else {
            bankScores.set(bank, result);
          }
        }
      }

      // Find the bank with highest score
      let detectedBank = 'unknown';
      let maxScore = 0;
      let matchedPatterns: string[] = [];

      for (const [bank, result] of bankScores.entries()) {
        if (result.score > maxScore) {
          maxScore = result.score;
          detectedBank = bank;
          matchedPatterns = result.matchedPatterns;
        }
      }

      // Calculate confidence based on score and text characteristics
      const confidence = this.calculateConfidence(maxScore, matchedPatterns.length, normalizedText);

      return {
        success: true,
        data: {
          bank: detectedBank,
          confidence: Math.min(confidence, 1.0), // Cap at 1.0
          patterns: matchedPatterns
        },
        metadata: {
          processingTime: Date.now() - startTime,
          textLength: text.length,
          normalizedTextLength: normalizedText.length,
          banksChecked: this.bankPatterns.length + this.customPatterns.size,
          maxScore: maxScore
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Bank detection failed: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime: Date.now() - startTime }
      };
    }
  }

  getSupportedBanks(): string[] {
    const builtInBanks = this.bankPatterns.map(p => p.bank);
    const customBanks = Array.from(this.customPatterns.keys());
    return [...new Set([...builtInBanks, ...customBanks])];
  }

  addCustomPattern(bank: string, patterns: string[]): void {
    if (!bank || bank.trim().length === 0) {
      throw new Error('Bank name cannot be empty');
    }

    if (!patterns || patterns.length === 0) {
      throw new Error('Patterns cannot be empty');
    }

    const normalizedBank = bank.toLowerCase().trim();
    const existingPatterns = this.customPatterns.get(normalizedBank) || [];
    this.customPatterns.set(normalizedBank, [...existingPatterns, ...patterns]);
  }

  private normalizeText(text: string): string {
    return text
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private calculateBankScore(text: string, bankPattern: BankPattern): {
    score: number;
    matchedPatterns: string[];
  } {
    let totalScore = 0;
    const matchedPatterns: string[] = [];

    for (const pattern of bankPattern.patterns) {
      const normalizedPattern = this.normalizeText(pattern);
      
      // Different scoring strategies
      if (text.includes(normalizedPattern)) {
        let patternScore = bankPattern.weight;

        // Bonus for exact matches
        if (text === normalizedPattern) {
          patternScore *= 2.0;
        }

        // Bonus for word boundaries (more reliable)
        const wordBoundaryRegex = new RegExp(`\\b${normalizedPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (wordBoundaryRegex.test(text)) {
          patternScore *= 1.5;
        }

        // Bonus for shorter patterns (more specific)
        if (normalizedPattern.length <= 10) {
          patternScore *= 1.2;
        }

        totalScore += patternScore;
        matchedPatterns.push(pattern);
      }
    }

    return { score: totalScore, matchedPatterns };
  }

  private calculateConfidence(score: number, patternCount: number, text: string): number {
    if (score === 0 || patternCount === 0) {
      return 0;
    }

    // Base confidence from score
    let confidence = Math.min(score / 5.0, 0.8); // Max 0.8 from score alone

    // Bonus for multiple pattern matches
    if (patternCount >= 2) {
      confidence += 0.1;
    }
    if (patternCount >= 3) {
      confidence += 0.1;
    }

    // Bonus for longer text (more context)
    if (text.length > 1000) {
      confidence += 0.05;
    }
    if (text.length > 5000) {
      confidence += 0.05;
    }

    // Penalty for very short text (less reliable)
    if (text.length < 200) {
      confidence *= 0.7;
    }

    return confidence;
  }
}