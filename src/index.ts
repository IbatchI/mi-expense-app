import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { GaliciaTextPreprocessor } from "./preprocessors/galicia-text.preprocessor";
import { BankDetector } from "./preprocessors/bank-detector";
import { getCreditCardPrompt } from "./prompts/enhanced-credit-card.prompt";
import { GeminiExtractor } from "./extractors/gemini.extractor";
import { GitHubExtractor } from "./extractors/github.extractor";
import { BaseExtractor } from "./extractors/base.extractor";
import { ExpenseClassifier } from "./classifiers/expense-classifier";
import { ExtractorConfig, CategorizedTransaction, CategoryBreakdown } from "./types/credit-card.types";

// Load environment variables
dotenv.config();

/**
 * Display category breakdown in a formatted way
 */
function displayCategoryBreakdown(breakdown: CategoryBreakdown): void {
  console.log("   📋 BY CATEGORY:");
  
  // Calculate totals
  const totalAmount = Object.values(breakdown).reduce((sum, cat) => sum + cat.total, 0);
  const totalTransactions = Object.values(breakdown).reduce((sum, cat) => sum + cat.count, 0);
  
  console.log(`   📊 Total Amount: $${totalAmount.toFixed(2)}`);
  console.log(`   📝 Total Transactions: ${totalTransactions}`);
  
  // Sort categories by amount (descending)
  const sortedCategories = Object.entries(breakdown)
    .sort(([,a], [,b]) => b.total - a.total);
  
  for (const [category, data] of sortedCategories) {
    const avgAmount = data.count > 0 ? (data.total / data.count).toFixed(2) : '0.00';
    
    console.log(`   • ${category}: $${data.total.toFixed(2)} (${data.percentage.toFixed(1)}%) - ${data.count} trans - Avg: $${avgAmount}`);
  }
}

/**
 * ENHANCED: Main application entry point with FULL PREPROCESSING + LLM PIPELINE
 * Integrates BankDetector, TextPreprocessor, Enhanced Prompts, and LLM extraction
 */
async function main() {
  console.log("🚀 Mi Expense App - Enhanced PDF Data Extractor");
  console.log("===============================================\n");

  try {
    // Get configuration from environment variables
    const config = getConfig();

    // Create appropriate extractor
    const extractor = createExtractor(config);

    // Get PDF path
    const pdfPath = process.env.PDF_PATH || path.join("pdfs", "visa-galicia.pdf");
    const outputPath =
      process.env.OUTPUT_PATH || path.join("output", "extracted-data.json");
    const preprocessedPath = path.join("output", "preprocessed-analysis.json");
    const cleanedTextPath = path.join("output", "cleaned-text.txt");
    const llmResultPath = path.join("output", "llm-result.json");
    const rawTextPath = path.join("output", "raw-pdf-text.txt");

    console.log(`\n📂 Processing: ${pdfPath}`);

    // Check if PDF exists
    if (!fs.existsSync(pdfPath)) {
      console.error(`❌ PDF file not found: ${pdfPath}`);
      console.log("\n📝 Instructions:");
      console.log(
        "1. Place your credit card statement PDF in the pdfs/ folder",
      );
      console.log('2. Rename it to "visa-galicia.pdf"');
      console.log("3. Or set the PDF_PATH environment variable");
      process.exit(1);
    }

    // STEP 1: Extract raw text
    console.log("\n🔍 Step 1: Extracting raw text from PDF...");
    const pdf = require("pdf-parse");
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdf(pdfBuffer);
    console.log(
      `   • ${pdfData.numpages} pages, ${pdfData.text.length} characters`,
    );

    // Save raw PDF text for analysis
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(rawTextPath, pdfData.text, "utf8");
    console.log(`   • Raw text saved to: ${rawTextPath}`);

    // STEP 2: Detect bank
    console.log("\n🏦 Step 2: Detecting bank...");
    const bankDetector = new BankDetector();
    const bankResult = bankDetector.detectBank(pdfData.text);
    console.log(`   • Bank: ${bankResult.bank.toUpperCase()}`);
    console.log(
      `   • Confidence: ${(bankResult.confidence * 100).toFixed(1)}%`,
    );

    if (bankResult.confidence < 0.5) {
      console.warn(
        "\n⚠️  Low confidence bank detection. Results may be inaccurate.",
      );
    }

    // STEP 3: Preprocess text
    console.log("\n🧹 Step 3: Preprocessing with bank-specific rules...");
    let preprocessedData: any;
    let cleanedText: string;

    if (bankResult.bank === "galicia") {
      const preprocessor = new GaliciaTextPreprocessor();
      const result = preprocessor.preprocess(pdfData.text);
      preprocessedData = result.extractedData;
      cleanedText = result.cleanedText;
      console.log(
        `   • Galicia preprocessor: ${preprocessedData.transactions.length} transactions, ${preprocessedData.taxes.length} taxes`,
      );
    } else {
      console.warn("   • No specific preprocessor available, using raw text");
      cleanedText = pdfData.text;
      preprocessedData = null;
    }

    // Save intermediate results
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (preprocessedData) {
      fs.writeFileSync(
        preprocessedPath,
        JSON.stringify(preprocessedData, null, 2),
        "utf8",
      );
    }
    fs.writeFileSync(cleanedTextPath, cleanedText, "utf8");

    // STEP 4: Test LLM connection - RE-ENABLED FOR PAMPA TESTING  
    console.log("\n🔌 Step 4: Testing LLM API connection...");
    const isConnected = await testConnectionSimple(extractor);
    if (!isConnected) {
      console.warn(
        "⚠️  API connection test failed, continuing with preprocessing only...",
      );
    } else {
      console.log("✅ API connection successful");
    }

    // STEP 5: Enhanced LLM extraction (if connection successful)
    let llmResult: any = null;

    if (isConnected) {
      console.log("\n🤖 Step 5: Enhanced LLM extraction...");

      try {
        // Create custom extraction method that uses enhanced prompt
        const enhancedPrompt = getCreditCardPrompt(bankResult.bank);
        const fullPrompt =
          enhancedPrompt + "\n\nSTATEMENT TEXT:\n" + cleanedText;

        console.log(
          `   • Using ${bankResult.bank.toUpperCase()} specific prompt`,
        );
        console.log(`   • Prompt length: ${fullPrompt.length} characters`);

        // Extract data using enhanced prompt directly
        const startTime = Date.now();
        const extractedData = await (extractor as any).extractData(fullPrompt);
        const processingTime = Date.now() - startTime;

        llmResult = {
          success: true,
          data: extractedData,
          metadata: {
            processingTime,
            pageCount: pdfData.numpages,
            provider: config.provider,
            model: config.model || "default",
          },
        };

        console.log(`   ✅ LLM extraction successful (${processingTime}ms)`);
      } catch (error) {
        console.error(
          `   ❌ LLM extraction failed: ${error instanceof Error ? error.message : error}`,
        );
        llmResult = {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          fallback: true,
        };
      }
    }

    // STEP 5.5: Expense Classification (if LLM extraction successful)
    let categorizedData: CategorizedTransaction[] | null = null;
    let categoryBreakdown: CategoryBreakdown | null = null;

    if (llmResult && llmResult.success && llmResult.data.transactions) {
      console.log("\n🏷️  Step 5.5: Classifying expenses...");
      
      try {
        const classifier = new ExpenseClassifier(extractor);
        const classificationResult = await classifier.classifyTransactions(llmResult.data);
        
        if (classificationResult.success && classificationResult.data) {
          categorizedData = classificationResult.data.transactions;
          categoryBreakdown = classificationResult.data.categoryBreakdown;
          
          console.log(`   ✅ Classified ${categorizedData.length} transactions`);
          console.log(`   📊 Categories found: ${Object.keys(categoryBreakdown).length}`);
          
          // Update LLM result with categorized data
          llmResult.data.categorizedTransactions = categorizedData;
          llmResult.data.categoryBreakdown = categoryBreakdown;
          
        } else {
          console.error(`   ❌ Classification failed: ${classificationResult.error || 'Unknown error'}`);
        }
        
      } catch (error) {
        console.error(`   ❌ Classification failed: ${error instanceof Error ? error.message : error}`);
        console.log(`   ⚠️  Continuing without categorization...`);
      }
    }

    // STEP 6: Save all results
    console.log("\n💾 Step 6: Saving results...");

    // Save LLM results if successful
    if (llmResult && llmResult.success) {
      fs.writeFileSync(
        llmResultPath,
        JSON.stringify(llmResult.data, null, 2),
        "utf8",
      );
      // Use LLM result as final output
      fs.writeFileSync(
        outputPath,
        JSON.stringify(llmResult.data, null, 2),
        "utf8",
      );
      console.log(`   ✅ LLM result saved to: ${llmResultPath}`);
      console.log(`   ✅ Final result saved to: ${outputPath}`);
    } else {
      // Fallback to preprocessing results
      if (preprocessedData) {
        fs.writeFileSync(
          outputPath,
          JSON.stringify(preprocessedData, null, 2),
          "utf8",
        );
        console.log(`   ⚠️  Using preprocessing fallback`);
        console.log(`   ✅ Preprocessing result saved to: ${outputPath}`);
      }
    }

    // STEP 7: Display comprehensive results
    console.log("\n✅ Enhanced extraction completed!");
    console.log("=" + "=".repeat(60));
    console.log(
      `🏦 Bank: ${bankResult.bank.toUpperCase()} (${(bankResult.confidence * 100).toFixed(1)}% confidence)`,
    );

    if (preprocessedData) {
      console.log(
        `🧹 Preprocessor: ${preprocessedData.transactions.length} transactions, ${preprocessedData.taxes.length} taxes`,
      );
    }

    if (llmResult && llmResult.success) {
      console.log(
        `🤖 LLM: ${config.provider} - SUCCESS (${llmResult.metadata.processingTime}ms)`,
      );
      console.log(`🎯 Final result: LLM enhanced data`);

      // Display categorization results if available
      if (categoryBreakdown) {
        console.log("\n💰 EXPENSE BREAKDOWN:");
        displayCategoryBreakdown(categoryBreakdown);
      }
    } else {
      console.log(`🤖 LLM: ${isConnected ? "FAILED" : "SKIPPED"}`);
      console.log(`🎯 Final result: Preprocessing fallback`);
    }

    console.log("=" + "=".repeat(60));

    console.log("\n📊 Next steps:");
    console.log(`   • Review final data: ${outputPath}`);
    if (llmResult && llmResult.success) {
      console.log(`   • Compare with preprocessing: ${preprocessedPath}`);
    }
    console.log("   • Import into your accounting software");
    console.log("   • Verify transaction accuracy");

    if (bankResult.confidence < 0.8) {
      console.log("\n⚠️  Recommendations:");
      console.log(
        "   • Manual verification recommended due to low bank detection confidence",
      );
      console.log("   • Consider improving bank detection patterns");
    }
  } catch (error) {
    console.error(
      "\n💥 Unexpected error:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

/**
 * Get configuration from environment variables
 */
function getConfig(): ExtractorConfig {
  const provider = process.env.PROVIDER as "gemini" | "github";

  if (!provider) {
    throw new Error(
      "PROVIDER environment variable is required (gemini or github)",
    );
  }

  if (!["gemini", "github"].includes(provider)) {
    throw new Error('PROVIDER must be either "gemini" or "github"');
  }

  let apiKey: string;

  if (provider === "gemini") {
    apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY environment variable is required when using Gemini provider",
      );
    }
  } else {
    apiKey = process.env.GITHUB_TOKEN || "";

    if (!apiKey) {
      throw new Error(
        "GITHUB_TOKEN environment variable is required when using GitHub provider",
      );
    }
  }

  const config: ExtractorConfig = {
    provider,
    apiKey,
  };

  if (process.env.MODEL) {
    config.model = process.env.MODEL;
  }

  return config;
}

/**
 * Create the appropriate extractor based on configuration
 */
function createExtractor(config: ExtractorConfig): BaseExtractor {
  console.log(`🔧 Initializing ${config.provider} extractor...`);

  if (config.provider === "gemini") {
    return new GeminiExtractor(config);
  } else if (config.provider === "github") {
    return new GitHubExtractor(config);
  } else {
    throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * Simple test connection for LLM
 */
async function testConnectionSimple(extractor: BaseExtractor): Promise<boolean> {
  try {
    if (extractor instanceof GeminiExtractor || extractor instanceof GitHubExtractor) {
      return await extractor.testConnection();
    }
    return false;
  } catch (error) {
    console.error("Connection test error:", error);
    return false;
  }
}

/**
 * Handle graceful shutdown
 */
/*
async function testConnection(extractor: BaseExtractor): Promise<boolean> {
  try {
    if (extractor instanceof GeminiExtractor || extractor instanceof GitHubExtractor) {
      return await extractor.testConnection();
    }
    return false;
  } catch (error) {
    console.error("Connection test error:", error);
    return false;
  }
/**
 * Handle graceful shutdown
 */
process.on("SIGINT", () => {
  console.log("\n🛑 Process interrupted by user");
  process.exit(0);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Run the application
if (require.main === module) {
  main().catch((error) => {
    console.error("💥 Application failed:", error);
    process.exit(1);
  });
}
