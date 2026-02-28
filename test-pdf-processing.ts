/**
 * PDF Processing Test Script
 * 
 * Tests the complete PDF processing pipeline by uploading a real PDF file
 * to the API and checking the response format.
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestConfig {
  serverUrl: string;
  pdfPath: string;
  apiKey: string;
  provider: 'gemini' | 'github';
}

class PDFProcessingTester {
  constructor(private config: TestConfig) {}

  /**
   * Test the complete PDF processing pipeline
   */
  async testPDFProcessing(): Promise<void> {
    try {
      console.log('🧪 Starting PDF Processing Pipeline Test');
      console.log('📄 PDF File:', this.config.pdfPath);
      console.log('🤖 Provider:', this.config.provider);
      console.log('');

      // Step 1: Read and encode PDF
      console.log('📖 Step 1: Reading PDF file...');
      const pdfBuffer = await this.readPDFFile();
      const pdfBase64 = pdfBuffer.toString('base64');
      console.log(`✅ PDF loaded: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

      // Step 2: Prepare request
      console.log('🔧 Step 2: Preparing API request...');
      const requestBody = {
        pdfData: pdfBase64,
        extractorConfig: {
          provider: this.config.provider,
          apiKey: this.config.apiKey,
          model: this.config.provider === 'gemini' ? 'gemini-pro' : 'gpt-4'
        }
      };

      // Step 3: Send request
      console.log('📤 Step 3: Sending processing request...');
      const startTime = Date.now();
      
      const response = await fetch(`${this.config.serverUrl}/api/v1/statements/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const duration = Date.now() - startTime;
      console.log(`⏱️  Request completed in ${duration}ms`);
      
      // Step 4: Process response
      console.log('📥 Step 4: Processing response...');
      const responseData = await response.json();
      
      console.log('📊 Response Status:', response.status);
      console.log('');

      if (response.ok) {
        this.analyzeSuccessResponse(responseData);
      } else {
        this.analyzeErrorResponse(responseData);
      }

    } catch (error) {
      console.error('❌ Test failed:', error);
    }
  }

  private async readPDFFile(): Promise<Buffer> {
    if (!fs.existsSync(this.config.pdfPath)) {
      throw new Error(`PDF file not found: ${this.config.pdfPath}`);
    }
    return fs.promises.readFile(this.config.pdfPath);
  }

  private analyzeSuccessResponse(data: any): void {
    console.log('✅ PDF Processing Successful!');
    console.log('');
    
    // Analyze processing details
    if (data.processingDetails) {
      console.log('🔍 Processing Details:');
      console.log(`   ⏱️  Total Time: ${data.processingDetails.totalTime}ms`);
      
      if (data.processingDetails.bankDetection) {
        console.log(`   🏦 Bank: ${data.processingDetails.bankDetection.bank}`);
        console.log(`   📊 Confidence: ${(data.processingDetails.bankDetection.confidence * 100).toFixed(1)}%`);
      }
      
      if (data.processingDetails.extraction) {
        console.log(`   🤖 Provider: ${data.processingDetails.extraction.provider}`);
        console.log(`   🧠 Model: ${data.processingDetails.extraction.model}`);
      }
      
      if (data.processingDetails.categorization) {
        console.log(`   📝 Categorized: ${data.processingDetails.categorization.categorizedCount}`);
        console.log(`   ❓ Uncategorized: ${data.processingDetails.categorization.uncategorizedCount}`);
        console.log(`   📊 Rate: ${(data.processingDetails.categorization.categorizationRate * 100).toFixed(1)}%`);
      }
      console.log('');
    }

    // Analyze statement data
    if (data.statement) {
      console.log('💳 Statement Analysis:');
      console.log(`   👤 Holder: ${data.statement.holder || 'N/A'}`);
      console.log(`   🏦 Bank: ${data.statement.bank || 'N/A'}`);
      console.log(`   💰 Total Pesos: ${data.statement.totals?.pesos?.formatted || 'N/A'}`);
      console.log(`   💵 Total Dollars: ${data.statement.totals?.dollars?.formatted || 'N/A'}`);
      console.log(`   📝 Transactions: ${data.statement.transactions?.length || 0}`);
      console.log(`   📊 Categories: ${Object.keys(data.statement.categoryBreakdown || {}).length}`);
      console.log('');
    }

    // Check frontend-optimized features
    this.validateFrontendOptimization(data);
  }

  private analyzeErrorResponse(data: any): void {
    console.log('❌ PDF Processing Failed');
    console.log('');
    console.log('🔍 Error Details:');
    console.log(`   Message: ${data.error || 'Unknown error'}`);
    
    if (data.processingDetails && data.processingDetails.steps) {
      console.log('   Steps:');
      for (const step of data.processingDetails.steps) {
        const emoji = step.status === 'success' ? '✅' : step.status === 'warning' ? '⚠️' : '❌';
        console.log(`     ${emoji} ${step.name}: ${step.details}`);
      }
    }
    
    if (data.warnings && data.warnings.length > 0) {
      console.log('   Warnings:');
      for (const warning of data.warnings) {
        console.log(`     ⚠️  ${warning}`);
      }
    }
    
    if (data.recommendations && data.recommendations.length > 0) {
      console.log('   Recommendations:');
      for (const rec of data.recommendations) {
        console.log(`     💡 ${rec}`);
      }
    }
  }

  private validateFrontendOptimization(data: any): void {
    console.log('🎨 Frontend Optimization Check:');
    let score = 0;
    const checks: string[] = [];

    // Check for category designs
    if (data.statement?.categoryBreakdown) {
      const hasDesigns = Object.values(data.statement.categoryBreakdown).some((cat: any) => 
        cat.design && cat.design.icon && cat.design.color
      );
      if (hasDesigns) {
        checks.push('✅ Category designs included');
        score++;
      } else {
        checks.push('❌ Category designs missing');
      }
    }

    // Check for formatted amounts
    if (data.statement?.totals?.pesos?.formatted) {
      checks.push('✅ Formatted currency amounts');
      score++;
    } else {
      checks.push('❌ Currency formatting missing');
    }

    // Check for complete transaction data
    if (data.statement?.transactions && data.statement.transactions.length > 0) {
      const firstTx = data.statement.transactions[0];
      if (firstTx.amount?.formatted && firstTx.category?.icon) {
        checks.push('✅ Complete transaction data');
        score++;
      } else {
        checks.push('❌ Incomplete transaction data');
      }
    }

    // Check for analytics
    if (data.statement?.analytics?.stats) {
      checks.push('✅ Analytics included');
      score++;
    } else {
      checks.push('❌ Analytics missing');
    }

    checks.forEach(check => console.log(`   ${check}`));
    console.log(`   📊 Frontend Score: ${score}/4`);
    console.log('');
  }
}

// Test configuration
async function runTest(): Promise<void> {
  const config: TestConfig = {
    serverUrl: 'http://localhost:3001',
    pdfPath: path.join(__dirname, '../../pdfs/visa-galicia.pdf'),
    apiKey: process.env.GEMINI_API_KEY || '',
    provider: 'gemini'
  };

  if (!config.apiKey) {
    console.error('❌ GEMINI_API_KEY environment variable not set');
    process.exit(1);
  }

  const tester = new PDFProcessingTester(config);
  await tester.testPDFProcessing();
}

// Run if called directly
if (require.main === module) {
  runTest();
}

export { PDFProcessingTester, TestConfig };