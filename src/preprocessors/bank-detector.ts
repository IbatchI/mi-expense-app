/**
 * Bank Detector
 * Automatically detects which bank issued the credit card statement
 * Currently supports Banco Galicia and Banco Pampa
 */

export type SupportedBank = 'galicia' | 'pampa' | 'unknown';

export interface BankDetectionResult {
  bank: SupportedBank;
  confidence: number; // 0-1
  indicators: string[];
}

export class BankDetector {
  /**
   * Detect bank from raw PDF text
   */
  public detectBank(rawText: string): BankDetectionResult {
    const galiciaResult = this.detectGalicia(rawText);
    const pampaResult = this.detectPampa(rawText);
    
    // Return the result with highest confidence
    if (galiciaResult.confidence > pampaResult.confidence) {
      return galiciaResult;
    } else if (pampaResult.confidence > 0) {
      return pampaResult;
    } else {
      return {
        bank: 'unknown',
        confidence: 0,
        indicators: ['No bank-specific patterns found'],
      };
    }
  }

  /**
   * Detect Banco Galicia specific patterns
   */
  private detectGalicia(text: string): BankDetectionResult {
    const indicators: string[] = [];
    let score = 0;

    // Primary identifier: CUIT Banco Galicia
    if (text.includes('CUIT Banco: 30-50000173-5')) {
      indicators.push('Galicia CUIT found (30-50000173-5)');
      score += 0.8;
    }

    // Secondary identifiers
    if (text.includes('Banco Galicia') || text.includes('bancogalicia.com')) {
      indicators.push('Galicia brand name found');
      score += 0.3;
    }

    // Statement format patterns
    if (text.match(/Resumen N° VI\d+/)) {
      indicators.push('Galicia statement number format (VI...)');
      score += 0.2;
    }

    // Galicia-specific services
    if (text.includes('Galicia Visa Gold')) {
      indicators.push('Galicia Visa Gold mentioned');
      score += 0.1;
    }

    // Tax patterns specific to Galicia format
    if (text.includes('IIBB PERCEP-LAPA') && text.includes('IVA RG 4240')) {
      indicators.push('Galicia tax format pattern');
      score += 0.2;
    }

    // Address pattern (Galicia format)
    if (text.match(/CALLE \d+ \d+, [A-Z\s]+, L\d+[A-Z]+/)) {
      indicators.push('Galicia address format');
      score += 0.1;
    }

    return {
      bank: 'galicia',
      confidence: Math.min(score, 1.0),
      indicators,
    };
  }

  /**
   * Detect Banco Pampa specific patterns
   * Supports both VISA and MasterCard formats from Banco de la Pampa
   */
  private detectPampa(text: string): BankDetectionResult {
    const indicators: string[] = [];
    let score = 0;

    // --- VISA patterns ---

    // Primary identifier: CUIT of the cardholder (VISA statements include it)
    if (text.includes('20-39385184-9')) {
      indicators.push('Pampa CUIT found (20-39385184-9)');
      score += 0.9;
    }

    // Pampa-specific card type (VISA)
    if (text.includes('VISA GOLD')) {
      indicators.push('VISA GOLD card type');
      score += 0.3;
    }

    // Pampa-specific package (VISA)
    if (text.includes('PAQUETE DORADO')) {
      indicators.push('Paquete Dorado found');
      score += 0.2;
    }

    // Pampa statement number format (13 digits - GOLD, VISA)
    if (text.match(/\d{13} - GOLD/)) {
      indicators.push('Pampa GOLD statement format');
      score += 0.2;
    }

    // Pampa customer service phone (VISA)
    if (text.includes('0810-222-CUOTAS') || text.includes('0810-222-CUOTA')) {
      indicators.push('Pampa customer service number');
      score += 0.1;
    }

    // Pampa sucursal format: "200 - (0200) GRAL PICO" (VISA)
    if (text.match(/\d+ - \(\d+\) [A-Z\s]+/)) {
      indicators.push('Pampa sucursal format');
      score += 0.1;
    }

    // --- MasterCard patterns ---

    // MasterCard Pampa: CUIT of the issuing entity (highest confidence for MC)
    if (text.includes('CUIT Entidad 30-99907583-1')) {
      indicators.push('Pampa MC entity CUIT found (30-99907583-1)');
      score += 0.9;
    }

    // MasterCard Pampa: Gold Line exclusive phone number
    if (text.includes('0800-222-3485')) {
      indicators.push('Pampa Gold Line phone found (0800-222-3485)');
      score += 0.4;
    }

    // MasterCard Pampa: account number format "Nº de Socio: 139-XXXXXXX"
    if (text.match(/N[°º]\s+de\s+Socio:\s*139-\d/)) {
      indicators.push('Pampa MC account number format (139-...)');
      score += 0.5;
    }

    // --- Shared patterns (VISA + MC) ---

    // Bank full name (appears in MC legal text and some VISA footers)
    if (text.includes('BANCO DE LA PAMPA')) {
      indicators.push('Banco de la Pampa full name found');
      score += 0.8;
    }

    return {
      bank: 'pampa',
      confidence: Math.min(score, 1.0),
      indicators,
    };
  }

  /**
   * Get appropriate preprocessor class name based on detected bank
   */
  public getPreprocessorName(bank: SupportedBank): string {
    switch (bank) {
      case 'galicia':
        return 'GaliciaTextPreprocessor';
      case 'pampa':
        return 'PampaTextPreprocessor';
      default:
        return 'GenericTextPreprocessor';
    }
  }
}