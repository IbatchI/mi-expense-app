// Quick debug script to understand the classification issue

const { ExpenseClassifier } = require('./dist/classifiers/expense-classifier');
const fs = require('fs');

// Mock extractor
class DebugExtractor {
  config = { provider: 'debug', model: 'debug' };
  
  async extractData(prompt) {
    console.log('🔍 PROMPT LENGTH:', prompt.length);
    console.log('🔍 PROMPT PREVIEW:');
    console.log(prompt.substring(0, 500) + '...');
    
    if (prompt.length === 0) {
      throw new Error("EMPTY PROMPT DETECTED!");
    }
    
    // Return a simple mock response
    return {
      classifications: [
        { index: 1, category: "Alimentación", confidence: 0.9, tags: ["#test"] }
      ]
    };
  }
}

async function debugClassification() {
  console.log('🐛 DEBUGGING CLASSIFICATION ISSUE');
  console.log('='.repeat(50));
  
  try {
    // Read the actual extracted data
    const data = JSON.parse(fs.readFileSync('output/extracted-data.json', 'utf8'));
    
    console.log('📊 DATA STRUCTURE:');
    console.log('- Transactions count:', data.transactions?.length || 0);
    console.log('- First transaction keys:', Object.keys(data.transactions[0] || {}));
    console.log('- Sample transaction:', JSON.stringify(data.transactions[0] || {}, null, 2));
    
    // Create classifier
    const extractor = new DebugExtractor();
    const classifier = new ExpenseClassifier(extractor);
    
    console.log('\n🔍 TESTING generateClassificationPrompt...');
    
    // Test with actual data
    const result = await classifier.classifyTransactions(data);
    
    console.log('✅ Classification result:', result.success);
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

debugClassification();
