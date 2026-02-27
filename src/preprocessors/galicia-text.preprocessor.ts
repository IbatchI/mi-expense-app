/**
 * Galicia Text Preprocessor
 * Cleans and normalizes raw PDF text from Banco Galicia VISA statements
 * Based on analysis of actual PDF content from visa-galicia.pdf
 */

export interface GaliciaTransaction {
  date: string;
  description: string;
  installments?: string; // e.g., "04/06" = installment 4 of 6
  reference: string;
  amountPesos?: number | undefined;
  amountUSD?: number | undefined;
  type: 'purchase' | 'payment' | 'tax' | 'fee';
}

export interface GaliciaStatementData {
  statementNumber: string;
  cardType: string;
  cardholderName: string;
  accountNumber: string;
  branch: string;
  cuit: string;
  address: string;
  statementDate: string;
  totalAmountPesos: number;
  totalAmountUSD: number;
  minimumPayment: number;
  transactions: GaliciaTransaction[];
  taxes: GaliciaTransaction[];
  limits: {
    purchaseLimit: number;
    financingLimit: number;
  };
  interestRates: {
    annualNominalPesos: number;
    annualNominalUSD: number;
    monthlyEffectivePesos: number;
    monthlyEffectiveUSD: number;
  };
}

export class GaliciaTextPreprocessor {
  /**
   * Main preprocessing function
   */
  public preprocess(rawText: string): {
    cleanedText: string;
    extractedData: GaliciaStatementData;
  } {
    console.log("🧹 Starting Galicia text preprocessing...");
    
    // Step 1: Remove duplicate headers and page breaks
    const textWithoutDuplicates = this.removeDuplicateHeaders(rawText);
    
    // Step 2: Extract basic statement info
    const statementInfo = this.extractStatementInfo(textWithoutDuplicates);
    
    // Step 3: Extract and clean transactions
    const transactions = this.extractTransactions(textWithoutDuplicates);
    
    // Step 4: Extract taxes and fees
    const taxes = this.extractTaxes(textWithoutDuplicates);
    
    // Step 5: Extract limits and rates
    const limits = this.extractLimits(textWithoutDuplicates);
    const interestRates = this.extractInterestRates(textWithoutDuplicates);
    
    // Step 6: Create cleaned text for LLM
    const cleanedText = this.createCleanedText(statementInfo, transactions, taxes, limits, interestRates);
    
    const extractedData: GaliciaStatementData = {
      ...statementInfo,
      transactions,
      taxes,
      limits,
      interestRates,
    };
    
    console.log(`✅ Preprocessing complete: ${transactions.length} transactions, ${taxes.length} taxes`);
    
    return {
      cleanedText,
      extractedData,
    };
  }

  /**
   * Remove duplicate headers that appear on each page
   */
  private removeDuplicateHeaders(text: string): string {
    // Remove repeated header blocks
    const headerPattern = /Resumen N° VI\d+\s+Tarjeta Crédito VISA[\s\S]*?Página\d+\s*\/\s*\d+/g;
    
    // Keep only the first occurrence
    let cleanText = text;
    const matches = text.match(headerPattern);
    if (matches && matches.length > 1) {
      // Remove all occurrences except the first
      for (let i = 1; i < matches.length; i++) {
        cleanText = cleanText.replace(matches[i], '');
      }
    }
    
    return cleanText;
  }

  /**
   * Extract basic statement information
   */
  private extractStatementInfo(text: string): Omit<GaliciaStatementData, 'transactions' | 'taxes' | 'limits' | 'interestRates'> {
    // Extract statement number
    const statementNumberMatch = text.match(/Resumen N° (VI\d+)/);
    const statementNumber = statementNumberMatch?.[1] || '';
    
    // Extract cardholder name (better pattern)
    const cardholderMatch = text.match(/Tarjeta Crédito VISA\s+([A-Z\s]+)\s+Consumidor Final/);
    const cardholderName = cardholderMatch?.[1]?.trim() || '';
    
    // Extract CUIT
    const cuitMatch = text.match(/CUIT Banco: ([\d\-]+)/);
    const cuit = cuitMatch?.[1] || '';
    
    // Extract account number
    const accountMatch = text.match(/N° Cuenta: (\d+)/);
    const accountNumber = accountMatch?.[1] || '';
    
    // Extract branch
    const branchMatch = text.match(/Sucursal: (\d+)/);
    const branch = branchMatch?.[1] || '';
    
    // Extract address (better pattern)
    const addressMatch = text.match(/([A-Z\d\s,]+),\s+([A-Z\s]+),\s+(L\d+[A-Z]+)/);
    const address = addressMatch ? `${addressMatch[1]}, ${addressMatch[2]}, ${addressMatch[3]}` : '';
    
    // Extract total amounts (more precise)
    const totalMatch = text.match(/TOTAL A PAGAR\s+([\d.,]+)([\-\d.,]*)/);
    const totalAmountPesos = totalMatch?.[1] ? this.parseArgentineNumber(totalMatch[1]) : 0;
    const totalAmountUSD = totalMatch?.[2] ? this.parseArgentineNumber(totalMatch[2]) : 0;
    
    // Extract minimum payment (more precise)
    const minimumMatch = text.match(/PAGO MINIMO[\s\S]*?\$\s*([\d.,]+)/);
    const minimumPayment = minimumMatch?.[1] ? this.parseArgentineNumber(minimumMatch[1]) : 0;
    
    // Extract statement date (use current date as placeholder)
    const statementDate = new Date().toISOString().split('T')[0];
    
    return {
      statementNumber,
      cardType: 'VISA',
      cardholderName,
      accountNumber,
      branch,
      cuit,
      address,
      statementDate,
      totalAmountPesos,
      totalAmountUSD,
      minimumPayment,
    };
  }

  /**
   * Extract and clean transaction data
   */
  private extractTransactions(text: string): GaliciaTransaction[] {
    const transactions: GaliciaTransaction[] = [];
    
    // Find the transactions section
    const transactionSectionMatch = text.match(/DETALLE DEL CONSUMO[\s\S]*?(?=TOTAL A PAGAR|19-02-26 IIBB)/);
    if (!transactionSectionMatch) return transactions;
    
    const transactionSection = transactionSectionMatch[0];
    
    // Handle special USD transactions first (like Spotify)
    const spotifyMatch = transactionSection.match(/(\d{2}-\d{2}-\d{2})FSpotify\s+USD\s+([\d.,]+)\s+(\d+)/);
    if (spotifyMatch) {
      transactions.push({
        date: this.formatDate(spotifyMatch[1]),
        description: 'Spotify',
        reference: spotifyMatch[3],
        amountUSD: this.parseArgentineNumber(spotifyMatch[2]),
        type: 'purchase',
      });
    }
    
    // Split by lines and process regular transactions
    const lines = transactionSection.split('\n').filter(line => line.trim());
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip headers, empty lines, and Spotify (already processed)
      if (!line || line.includes('FECHAREFERENCIACUOTA') || 
          line.includes('DETALLE DEL CONSUMO') || line.includes('FSpotify')) {
        continue;
      }
      
      // Try to parse transaction line
      const transaction = this.parseTransactionLine(line, lines[i + 1], lines[i + 2]);
      if (transaction) {
        transactions.push(transaction);
        // Skip the next lines if they were consumed
        if (transaction.reference && /^\d+$/.test(lines[i + 1]?.trim())) i++;
        if (transaction.amountPesos || transaction.amountUSD) i++;
      }
    }
    
    return transactions;
  }

  /**
   * Parse individual transaction line
   */
  private parseTransactionLine(line: string, nextLine?: string, thirdLine?: string): GaliciaTransaction | null {
    // Pattern for transaction: DATE*DESCRIPTION INSTALLMENTS or DATE*DESCRIPTION USD
    const transactionPattern = /^(\d{2}-\d{2}-\d{2})\s*([*K]?)([^0-9]*?)\s*(?:(\d{2}\/\d{2})|USD)?\s*$/;
    const match = line.match(transactionPattern);
    
    if (!match) return null;
    
    const [, rawDate, , description, installments] = match;
    
    // Clean description
    let cleanDescription = description.trim();
    if (cleanDescription.startsWith('*')) {
      cleanDescription = cleanDescription.substring(1);
    }
    
    // Clean merchant names
    cleanDescription = this.cleanMerchantName(cleanDescription);
    
    // Format date to ISO
    const date = this.formatDate(rawDate);
    
    // Get reference from next line (if it's a number)
    const reference = nextLine && /^\d+$/.test(nextLine.trim()) ? nextLine.trim() : '';
    
    // Get amount from third line or detect USD in same line
    let amountPesos: number | undefined;
    let amountUSD: number | undefined;
    
    // Check if it's a USD transaction (like Spotify)
    if (line.includes('USD')) {
      const usdMatch = line.match(/USD\s+([\d.,]+)/);
      if (usdMatch) {
        amountUSD = this.parseArgentineNumber(usdMatch[1]);
      }
    } else if (thirdLine) {
      const amountMatch = thirdLine.match(/([\d.,]+)/);
      if (amountMatch) {
        amountPesos = this.parseArgentineNumber(amountMatch[1]);
      }
    }
    
    return {
      date,
      description: cleanDescription,
      installments,
      reference,
      amountPesos,
      amountUSD,
      type: 'purchase',
    };
  }

  /**
   * Extract tax entries
   */
  private extractTaxes(text: string): GaliciaTransaction[] {
    const taxes: GaliciaTransaction[] = [];
    
    // IIBB Perception
    const iibbMatch = text.match(/(\d{2}-\d{2}-\d{2})\s+IIBB PERCEP[^(]*\([\s\d.,()]+\)\s*([\d.,]+)/);
    if (iibbMatch) {
      taxes.push({
        date: this.formatDate(iibbMatch[1]),
        description: 'IIBB Perception',
        reference: 'TAX',
        amountPesos: this.parseArgentineNumber(iibbMatch[2]),
        type: 'tax',
      });
    }
    
    // IVA RG 4240
    const ivaMatch = text.match(/(\d{2}-\d{2}-\d{2})\s+IVA RG 4240[^(]*\([\s\d.,()]+\)\s*([\d.,]+)/);
    if (ivaMatch) {
      taxes.push({
        date: this.formatDate(ivaMatch[1]),
        description: 'IVA RG 4240',
        reference: 'TAX',
        amountPesos: this.parseArgentineNumber(ivaMatch[2]),
        type: 'tax',
      });
    }
    
    // DB.RG 5617
    const dbMatch = text.match(/(\d{2}-\d{2}-\d{2})\s+DB\.RG 5617[^(]*\([\s\d.,()]+\)\s*([\d.,]+)/);
    if (dbMatch) {
      taxes.push({
        date: this.formatDate(dbMatch[1]),
        description: 'DB.RG 5617',
        reference: 'TAX',
        amountPesos: this.parseArgentineNumber(dbMatch[2]),
        type: 'tax',
      });
    }
    
    return taxes;
  }

  /**
   * Extract credit limits
   */
  private extractLimits(text: string): { purchaseLimit: number; financingLimit: number } {
    const purchaseMatch = text.match(/De compras en un pago y en cuotas\s+\$\s*([\d.,]+)/);
    const financingMatch = text.match(/De financiación\s+\$\s*([\d.,]+)/);
    
    return {
      purchaseLimit: purchaseMatch?.[1] ? this.parseArgentineNumber(purchaseMatch[1]) : 0,
      financingLimit: financingMatch?.[1] ? this.parseArgentineNumber(financingMatch[1]) : 0,
    };
  }

  /**
   * Extract interest rates
   */
  private extractInterestRates(text: string): {
    annualNominalPesos: number;
    annualNominalUSD: number;
    monthlyEffectivePesos: number;
    monthlyEffectiveUSD: number;
  } {
    const nominalPesosMatch = text.match(/En pesos\s+([\d.,]+)%/);
    const nominalUSDMatch = text.match(/En dólares\s+([\d.,]+)%/);
    const monthlyPesosMatch = text.match(/En pesos\s+([\d.,]+)%[\s\S]*?En dólares[\s\S]*?En pesos\s+([\d.,]+)%/);
    const monthlyUSDMatch = text.match(/En dólares\s+([\d.,]+)%[\s\S]*?En pesos[\s\S]*?En dólares\s+([\d.,]+)%/);
    
    return {
      annualNominalPesos: nominalPesosMatch?.[1] ? this.parseArgentineNumber(nominalPesosMatch[1]) : 0,
      annualNominalUSD: nominalUSDMatch?.[1] ? this.parseArgentineNumber(nominalUSDMatch[1]) : 0,
      monthlyEffectivePesos: monthlyPesosMatch?.[2] ? this.parseArgentineNumber(monthlyPesosMatch[2]) : 0,
      monthlyEffectiveUSD: monthlyUSDMatch?.[2] ? this.parseArgentineNumber(monthlyUSDMatch[2]) : 0,
    };
  }

  /**
   * Create cleaned text for LLM processing
   */
  private createCleanedText(
    statementInfo: Omit<GaliciaStatementData, 'transactions' | 'taxes' | 'limits' | 'interestRates'>,
    transactions: GaliciaTransaction[],
    taxes: GaliciaTransaction[],
    limits: { purchaseLimit: number; financingLimit: number },
    interestRates: { annualNominalPesos: number; annualNominalUSD: number; monthlyEffectivePesos: number; monthlyEffectiveUSD: number }
  ): string {
    const sections = [
      "BANCO GALICIA VISA CREDIT CARD STATEMENT",
      "",
      `Statement Number: ${statementInfo.statementNumber}`,
      `Cardholder: ${statementInfo.cardholderName}`,
      `Account: ${statementInfo.accountNumber}`,
      `Branch: ${statementInfo.branch}`,
      `CUIT: ${statementInfo.cuit}`,
      `Address: ${statementInfo.address}`,
      "",
      `TOTALS:`,
      `Total Amount (Pesos): $${statementInfo.totalAmountPesos.toFixed(2)}`,
      `Total Amount (USD): $${statementInfo.totalAmountUSD.toFixed(2)}`,
      `Minimum Payment: $${statementInfo.minimumPayment.toFixed(2)}`,
      "",
      `LIMITS:`,
      `Purchase Limit: $${limits.purchaseLimit.toFixed(2)}`,
      `Financing Limit: $${limits.financingLimit.toFixed(2)}`,
      "",
      `INTEREST RATES:`,
      `Annual Nominal (Pesos): ${interestRates.annualNominalPesos}%`,
      `Annual Nominal (USD): ${interestRates.annualNominalUSD}%`,
      `Monthly Effective (Pesos): ${interestRates.monthlyEffectivePesos}%`,
      `Monthly Effective (USD): ${interestRates.monthlyEffectiveUSD}%`,
      "",
      "TRANSACTIONS:",
    ];
    
    transactions.forEach(tx => {
      sections.push(
        `Date: ${tx.date} | Description: ${tx.description} | ${tx.installments ? `Installment: ${tx.installments} | ` : ''}` +
        `Amount: ${tx.amountPesos ? `$${tx.amountPesos.toFixed(2)} ARS` : ''}${tx.amountUSD ? `$${tx.amountUSD.toFixed(2)} USD` : ''} | ` +
        `Reference: ${tx.reference}`
      );
    });
    
    if (taxes.length > 0) {
      sections.push("", "TAXES AND FEES:");
      taxes.forEach(tax => {
        sections.push(
          `Date: ${tax.date} | Description: ${tax.description} | Amount: $${tax.amountPesos?.toFixed(2) || '0.00'} ARS`
        );
      });
    }
    
    return sections.join('\n');
  }

  /**
   * Clean merchant names
   */
  private cleanMerchantName(name: string): string {
    return name
      .replace(/^\*+/, '') // Remove leading asterisks
      .replace(/\*+$/, '') // Remove trailing asterisks
      .replace(/^WWW\./, '') // Remove WWW prefix
      .replace(/\.COM\.A$/, '.COM.AR') // Fix .COM.A to .COM.AR
      .replace(/MERPAGO\*/, 'MERCADOPAGO ') // Fix MERPAGO to MERCADOPAGO
      .trim();
  }

  /**
   * Parse Argentine number format where:
   * - Periods (.) are thousand separators
   * - Commas (,) are decimal separators
   * Examples: 25.000,00 → 25000.00, 1.234.567,89 → 1234567.89, 500 → 500
   */
  private parseArgentineNumber(numberStr: string): number {
    if (!numberStr || typeof numberStr !== 'string') {
      return 0;
    }

    // Clean the string of any non-digit, period, or comma characters
    const cleanStr = numberStr.trim().replace(/[^\d.,]/g, '');
    
    if (!cleanStr) {
      return 0;
    }

    // Handle different Argentine number formats:
    
    // Case 1: Has comma (decimal separator) - e.g., "25.000,00" or "123,45"
    if (cleanStr.includes(',')) {
      const parts = cleanStr.split(',');
      if (parts.length !== 2) {
        return 0; // Invalid format
      }
      
      const integerPart = parts[0].replace(/\./g, ''); // Remove thousand separators
      const decimalPart = parts[1];
      
      return parseFloat(`${integerPart}.${decimalPart}`);
    }
    
    // Case 2: Only periods - could be thousand separators or decimal
    if (cleanStr.includes('.')) {
      const parts = cleanStr.split('.');
      
      // If last part has 1-2 digits, treat as decimal (e.g., "25.50")
      // If last part has 3+ digits, treat all as thousand separators (e.g., "25.000")
      if (parts.length >= 2 && parts[parts.length - 1].length <= 2) {
        // Treat as decimal: "25.50" → 25.50
        const integerParts = parts.slice(0, -1).join('');
        const decimalPart = parts[parts.length - 1];
        return parseFloat(`${integerParts}.${decimalPart}`);
      } else {
        // Treat as thousand separators: "25.000" → 25000
        return parseFloat(cleanStr.replace(/\./g, ''));
      }
    }
    
    // Case 3: No separators - just digits
    return parseFloat(cleanStr);
  }

  /**
   * Format date from DD-MM-YY to YYYY-MM-DD
   */
  private formatDate(dateStr: string): string {
    const [day, month, year] = dateStr.split('-');
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
}