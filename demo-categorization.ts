/**
 * Demo script to show expense categorization working with real Galicia data
 * This simulates the complete pipeline including LLM categorization
 */

import { ExpenseClassifier } from './src/classifiers/expense-classifier';
import { CategoryBreakdown } from './src/types/credit-card.types';
import * as fs from 'fs';
import * as path from 'path';

// Mock extractor that simulates LLM responses for real Galicia transactions
class MockExtractor {
  config = { provider: 'demo', model: 'demo' };
  
  async extractData(prompt: string): Promise<any> {
    // Simulated intelligent categorization based on real transaction descriptions
    return {
      classifications: [
        { index: 1, category: "Ocio y Entretenimiento", confidence: 0.95, reasoning: "Spotify music subscription", tags: ["#streaming"] },
        { index: 2, category: "Compras Personales", confidence: 0.88, reasoning: "Jules jewelry/accessories online store", tags: ["#accesorios"] },
        { index: 3, category: "Compras Personales", confidence: 0.92, reasoning: "Adidas sportswear purchase", tags: ["#ropa"] },
        { index: 4, category: "Ocio y Entretenimiento", confidence: 0.85, reasoning: "Kinderland entertainment/toys", tags: ["#juegos"] },
        { index: 5, category: "Salud", confidence: 0.94, reasoning: "Farmacity pharmacy purchase", tags: ["#medicamentos"] },
        { index: 6, category: "Compras Personales", confidence: 0.87, reasoning: "Grimoldi shoes/accessories", tags: ["#ropa"] },
        { index: 7, category: "Hogar", confidence: 0.91, reasoning: "AySA water service utility bill", tags: ["#agua"] },
        { index: 8, category: "Alimentación", confidence: 0.89, reasoning: "Food delivery service", tags: ["#delivery"] },
        { index: 9, category: "Transporte", confidence: 0.93, reasoning: "YPF gas station fuel", tags: ["#combustible"] },
        { index: 10, category: "Trabajo / Negocio", confidence: 0.86, reasoning: "Business software/tools", tags: ["#software"] },
        { index: 11, category: "Alimentación", confidence: 0.90, reasoning: "Food/restaurant purchase", tags: ["#restaurantes"] }
      ]
    };
  }
}

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

async function demonstrateCategorization() {
  console.log("🎬 DEMO: Mi Expense App - Complete Categorization System");
  console.log("=".repeat(70));
  
  try {
    // Read real Galicia data from preprocessing
    const dataPath = path.join('output', 'extracted-data.json');
    
    if (!fs.existsSync(dataPath)) {
      console.error('❌ No preprocessed data found. Please run the main app first.');
      return;
    }
    
    const realData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    console.log("📊 REAL GALICIA DATA LOADED:");
    console.log(`   • Bank: GALICIA`);
    console.log(`   • Statement: ${realData.statementNumber}`);
    console.log(`   • Cardholder: ${realData.cardholderName}`);
    console.log(`   • Transactions: ${realData.transactions.length}`);
    console.log(`   • Total Amount: $${realData.totalAmountPesos.toLocaleString()}`);
    
    // Display some real transactions
    console.log("\\n📝 SAMPLE TRANSACTIONS:");
    realData.transactions.slice(0, 5).forEach((trans: any, index: number) => {
      const amount = trans.amountPesos || (trans.amountUSD ? `$${trans.amountUSD} USD` : 'N/A');
      console.log(`   ${index + 1}. ${trans.description} - ${amount}`);
    });
    
    if (realData.transactions.length > 5) {
      console.log(`   ... and ${realData.transactions.length - 5} more transactions`);
    }
    
    // Create mock extractor and classifier
    const mockExtractor = new MockExtractor() as any;
    const classifier = new ExpenseClassifier(mockExtractor);
    
    // Run classification
    console.log("\\n🏷️  RUNNING EXPENSE CLASSIFICATION...");
    const startTime = Date.now();
    const result = await classifier.classifyTransactions(realData);
    const processingTime = Date.now() - startTime;
    
    if (result.success && result.data) {
      console.log(`   ✅ Classification completed (${processingTime}ms)`);
      
      const categorizedTransactions = result.data.transactions;
      const categoryBreakdown = result.data.categoryBreakdown;
      
      console.log(`   📊 Successfully categorized ${categorizedTransactions.length} transactions`);
      
      // Display beautiful category breakdown
      console.log("\\n💰 EXPENSE BREAKDOWN:");
      displayCategoryBreakdown(categoryBreakdown);
      
      // Show categorized transactions
      console.log("\\n📝 CATEGORIZED TRANSACTIONS:");
      categorizedTransactions.forEach((trans: any, index: number) => {
        const amount = trans.amountPesos || (trans.amountUSD ? `$${trans.amountUSD} USD` : 'N/A');
        const confidence = (trans.confidence * 100).toFixed(1);
        console.log(`   ${index + 1}. ${trans.category} (${confidence}%) - ${amount} - ${trans.description}`);
      });
      
      // Display classification metrics
      if (result.data.classificationMetadata) {
        const meta = result.data.classificationMetadata;
        console.log("\\n📈 CLASSIFICATION METRICS:");
        console.log(`   • Processing time: ${meta.processingTime}ms`);
        console.log(`   • Total transactions: ${meta.totalTransactions}`);
        console.log(`   • Successfully categorized: ${meta.categorizedTransactions}`);
        console.log(`   • Uncategorized: ${meta.uncategorizedTransactions}`);
        console.log(`   • Success rate: ${((meta.categorizedTransactions / meta.totalTransactions) * 100).toFixed(1)}%`);
      }
      
      // Save demo results
      const demoOutputPath = path.join('output', 'demo-categorized-data.json');
      fs.writeFileSync(demoOutputPath, JSON.stringify(result.data, null, 2), 'utf8');
      console.log(`\\n💾 Demo results saved to: ${demoOutputPath}`);
      
    } else {
      console.error(`   ❌ Classification failed: ${result.error}`);
    }
    
  } catch (error) {
    console.error("Demo failed:", error);
  }
}

// Run the demo
console.log("🎯 This demo shows how your expense categorization would work with real LLM APIs");
console.log("📋 Using real Galicia transaction data with simulated intelligent categorization\\n");

demonstrateCategorization().then(() => {
  console.log("\\n🎉 DEMO COMPLETED!");
  console.log("\\n🔮 When LLM APIs are working, you'll see this exact output");
  console.log("   with your real credit card statements automatically categorized!");
}).catch(error => {
  console.error("❌ Demo failed:", error);
});