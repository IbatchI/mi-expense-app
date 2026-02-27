import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import { ExtractorConfig, ExtractionResult } from '../types/credit-card.types';
import { generateExtractionPrompt } from '../prompts/credit-card.prompt';

/**
 * Base class for PDF data extractors
 */
export abstract class BaseExtractor {
  protected config: ExtractorConfig;

  constructor(config: ExtractorConfig) {
    this.config = config;
  }

  /**
   * Extract credit card data from a PDF file
   */
  async extractFromPDF(pdfPath: string): Promise<ExtractionResult> {
    const startTime = Date.now();
    
    try {
      // Check if PDF file exists
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found: ${pdfPath}`);
      }

      // Read and parse PDF
      console.log('📄 Reading PDF file...');
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfData = await pdfParse(pdfBuffer);
      
      if (!pdfData.text || pdfData.text.trim().length === 0) {
        throw new Error('No text content found in PDF');
      }

      console.log('📊 Extracting data with LLM...');
      console.log(`   Pages: ${pdfData.numpages}`);
      console.log(`   Text length: ${pdfData.text.length} characters`);
      
      // Generate prompt and extract data
      const prompt = generateExtractionPrompt(pdfData.text);
      const extractedData = await this.extractData(prompt);

      // Validate extracted data
      this.validateExtractedData(extractedData);

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        data: extractedData,
        metadata: {
          processingTime,
          pageCount: pdfData.numpages,
          provider: this.config.provider,
          model: this.config.model || 'default'
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          processingTime,
          pageCount: 0,
          provider: this.config.provider,
          model: this.config.model || 'default'
        }
      };
    }
  }

  /**
   * Extract credit card data from preprocessed text
   */
  async extractFromText(text: string, _sourcePath?: string): Promise<ExtractionResult> {
    const startTime = Date.now();
    
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('No text content provided');
      }

      console.log('📊 Extracting data from preprocessed text with LLM...');
      console.log(`   Text length: ${text.length} characters`);
      
      // Generate prompt and extract data using provided text
      const prompt = generateExtractionPrompt(text);
      const extractedData = await this.extractData(prompt);

      // Validate extracted data
      this.validateExtractedData(extractedData);

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        data: extractedData,
        metadata: {
          processingTime,
          pageCount: 1, // Assume 1 since we're working with preprocessed text
          provider: this.config.provider,
          model: this.config.model || 'default'
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          processingTime,
          pageCount: 0,
          provider: this.config.provider,
          model: this.config.model || 'default'
        }
      };
    }
  }

  /**
   * Abstract method to be implemented by concrete extractors
   */
  protected abstract extractData(prompt: string): Promise<any>;

  /**
   * Flexible validation for both old and new data formats
   */
  protected validateExtractedData(data: any): void {
    if (!data) {
      throw new Error('No data extracted');
    }

    // Check for holder/cardholderName
    const holder = data.holder || data.cardholderName;
    if (!holder || typeof holder !== 'string') {
      console.warn('⚠️  Missing or invalid holder name');
    }

    // Check for accountNumber
    if (!data.accountNumber || typeof data.accountNumber !== 'string') {
      console.warn('⚠️  Missing or invalid account number');
    }

    // Check for bank
    if (!data.bank || typeof data.bank !== 'string') {
      console.warn('⚠️  Missing or invalid bank name');
    }

    // Check for transactions
    if (!Array.isArray(data.transactions)) {
      console.warn('⚠️  Missing or invalid transactions array');
    }

    console.log('✅ Data validation completed (flexible mode)');
  }

  /**
   * Save extracted data to a JSON file
   */
  async saveToFile(data: any, outputPath: string): Promise<void> {
    try {
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write JSON file with pretty formatting
      const jsonContent = JSON.stringify(data, null, 2);
      fs.writeFileSync(outputPath, jsonContent, 'utf-8');
      
      console.log(`💾 Data saved to: ${outputPath}`);
    } catch (error) {
      throw new Error(`Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean and parse JSON response from LLM
   */
  protected cleanJsonResponse(response: string): any {
    try {
      // Remove markdown code blocks if present
      let cleaned = response.replace(/```json\s*/, '').replace(/```\s*$/, '');
      
      // Remove any leading/trailing whitespace
      cleaned = cleaned.trim();
      
      // Try to parse JSON
      const parsed = JSON.parse(cleaned);
      
      return parsed;
    } catch (error) {
      console.error('Raw LLM response:', response);
      throw new Error(`Failed to parse LLM response as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Log extraction statistics (flexible for both data formats)
   */
  protected logStats(data: any): void {
    console.log('\n📈 Extraction Summary:');
    
    // Handle different data formats
    const holder = data.holder || data.cardholderName || 'Unknown';
    const bank = data.bank || 'Unknown';
    const account = data.accountNumber || 'Unknown';
    const transactionCount = data.transactions ? data.transactions.length : 0;
    
    // Handle different total formats
    let totalPesos = 0;
    let totalDollars = 0;
    let period = '';
    
    if (data.totals) {
      // Old format
      totalPesos = data.totals.pesos || 0;
      totalDollars = data.totals.dollars || 0;
    } else {
      // New format
      totalPesos = data.totalAmountPesos || 0;
      totalDollars = data.totalAmountUSD || 0;
    }
    
    if (data.period) {
      period = `${data.period.currentClosing} to ${data.period.currentDueDate}`;
    } else if (data.statementDate) {
      period = data.statementDate;
    }
    
    console.log(`   Holder: ${holder}`);
    console.log(`   Bank: ${bank}`);
    console.log(`   Account: ${account}`);
    console.log(`   Transactions: ${transactionCount}`);
    console.log(`   Total Pesos: $${totalPesos.toLocaleString()}`);
    console.log(`   Total Dollars: $${totalDollars.toLocaleString()}`);
    if (period) {
      console.log(`   Period: ${period}`);
    }
  }
}