// Test Pampa data format specifically

const { ExpenseClassifier } = require('./dist/classifiers/expense-classifier');

// Mock extractor
class DebugExtractor {
  config = { provider: 'debug', model: 'debug' };
  
  async extractData(prompt) {
    console.log('🔍 PROMPT LENGTH:', prompt.length);
    console.log('🔍 FIRST 100 CHARS:', prompt.substring(0, 100));
    
    if (prompt.length === 0) {
      throw new Error("EMPTY PROMPT DETECTED!");
    }
    
    return {
      classifications: [
        { index: 1, category: "Alimentación", confidence: 0.9, tags: ["#test"] }
      ]
    };
  }
}

async function testPampaFormat() {
  console.log('🏦 TESTING PAMPA DATA FORMAT');
  console.log('='.repeat(50));
  
  try {
    // Create mock Pampa data based on prompt specification
    const pampaData = {
      holder: "HERNANDEZ LUCAS MATEO",
      accountNumber: "1082141836", 
      bank: "Banco de la Pampa",
      period: {
        currentDueDate: "2026-03-04",
        currentClosing: "2026-02-19", 
        previousClosing: "2026-01-22",
        previousDueDate: "2026-02-19"
      },
      totals: {
        pesos: 521348.70,
        dollars: 0,
        minimumPayment: 60748.70
      },
      transactions: [
        {
          date: "2025-11-01",
          description: "ROQUE NUBLO", 
          amount: 30769.25,
          currency: "ARS",
          type: "purchase",
          installments: "04/04",
          reference: "002033"
        },
        {
          date: "2026-02-04",
          description: "SU PAGO EN PESOS",
          amount: -4384.07,
          currency: "ARS", 
          type: "payment",
          installments: null,
          reference: null
        },
        {
          date: "2026-02-19",
          description: "IMP DE SELLOS P/INT.FIN.",
          amount: 25.26,
          currency: "ARS",
          type: "tax",
          installments: null,
          reference: null
        }
      ]
    };
    
    console.log('📊 PAMPA DATA STRUCTURE:');
    console.log('- Transactions count:', pampaData.transactions?.length || 0);
    console.log('- First transaction keys:', Object.keys(pampaData.transactions[0] || {}));
    console.log('- Sample transaction:', JSON.stringify(pampaData.transactions[0] || {}, null, 2));
    
    // Create classifier
    const extractor = new DebugExtractor();
    const classifier = new ExpenseClassifier(extractor);
    
    console.log('\n🔍 TESTING with Pampa data...');
    
    // Test with Pampa data
    const result = await classifier.classifyTransactions(pampaData);
    
    console.log('✅ Classification result:', result.success);
    if (!result.success) {
      console.error('❌ Error:', result.error);
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

testPampaFormat();
