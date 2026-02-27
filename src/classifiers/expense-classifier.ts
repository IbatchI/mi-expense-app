import { BaseExtractor } from '../extractors/base.extractor';
import { 
  CategorizedStatement, 
  CategorizedTransaction, 
  CategoryBreakdown, 
  ClassificationResult 
} from '../types/credit-card.types';

/**
 * ExpenseClassifier - Categorizes credit card transactions into expense categories
 * Uses LLM to analyze transaction descriptions and assign appropriate categories
 */
export class ExpenseClassifier {
  private extractor: BaseExtractor;
  
  // Category mappings with Spanish to English translation
  private readonly CATEGORIES: { [key: string]: { en: string; tags: string[] } } = {
    "Hogar": { 
      en: "Home", 
      tags: ["#alquiler", "#expensas", "#luz", "#gas", "#agua", "#internet"] 
    },
    "Alimentación": { 
      en: "Food", 
      tags: ["#supermercado", "#restaurantes", "#delivery", "#cafe", "#snacks"] 
    },
    "Transporte": { 
      en: "Transport", 
      tags: ["#combustible", "#transporte_publico", "#uber", "#taxi", "#peajes", "#mantenimiento_auto"] 
    },
    "Ocio y Entretenimiento": { 
      en: "Entertainment", 
      tags: ["#salidas", "#streaming", "#cine", "#eventos", "#juegos"] 
    },
    "Salud": { 
      en: "Health", 
      tags: ["#obra_social", "#seguro_medico", "#medicamentos", "#consultas_medicas"] 
    },
    "Compras Personales": { 
      en: "Personal Shopping", 
      tags: ["#ropa", "#tecnologia", "#accesorios"] 
    },
    "Educación": { 
      en: "Education", 
      tags: ["#cursos", "#libros", "#suscripciones_educativas"] 
    },
    "Mascotas": { 
      en: "Pets", 
      tags: ["#alimento_mascota", "#veterinario"] 
    },
    "Trabajo / Negocio": { 
      en: "Work/Business", 
      tags: ["#software", "#herramientas", "#equipamiento"] 
    },
    "Sin Categoría": { 
      en: "Uncategorized", 
      tags: ["#sin_clasificar"] 
    }
  };

  constructor(extractor: BaseExtractor) {
    this.extractor = extractor;
  }

  /**
   * Main method: Classify all transactions in extracted data
   */
  async classifyTransactions(extractedData: any): Promise<ClassificationResult> {
    const startTime = Date.now();
    
    try {
      console.log('   🔍 Analyzing transactions for categorization...');
      
      if (!extractedData.transactions || !Array.isArray(extractedData.transactions)) {
        throw new Error('No transactions found in extracted data');
      }

      const transactions = extractedData.transactions;
      console.log(`   📊 Found ${transactions.length} transactions to classify`);

      // Generate classification prompt
      const prompt = this.generateClassificationPrompt(transactions);
      console.log(`   📝 Generated classification prompt (${prompt.length} chars)`);

      // Call LLM for classification
      const classificationResponse = await (this.extractor as any).extractData(prompt);
      
      // Parse response
      const classifications = this.parseClassificationResponse(classificationResponse);
      console.log(`   ✅ Parsed ${classifications.length} classifications`);

      // Merge original data with classifications
      const categorizedTransactions = this.mergeClassificationResults(
        transactions, 
        classifications
      );

      // Calculate category breakdown
      const categoryBreakdown = this.calculateCategoryBreakdown(categorizedTransactions);

      // Build categorized statement
      const categorizedStatement: CategorizedStatement = {
        ...extractedData,
        transactions: categorizedTransactions,
        categoryBreakdown,
        classificationMetadata: {
          processingTime: Date.now() - startTime,
          totalTransactions: transactions.length,
          categorizedTransactions: categorizedTransactions.filter(t => t.category !== "Sin Categoría").length,
          uncategorizedTransactions: categorizedTransactions.filter(t => t.category === "Sin Categoría").length
        }
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        data: categorizedStatement,
        metadata: {
          processingTime,
          provider: (this.extractor as any).config?.provider || 'unknown',
          model: (this.extractor as any).config?.model || 'unknown'
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown classification error',
        metadata: {
          processingTime,
          provider: (this.extractor as any).config?.provider || 'unknown',
          model: (this.extractor as any).config?.model || 'unknown'
        }
      };
    }
  }

  /**
   * Generate classification prompt for LLM
   */
  private generateClassificationPrompt(transactions: any[]): string {
    const transactionList = transactions.map((t, index) => {
      const amount = this.getTransactionAmount(t);
      return `${index + 1}. "${t.description || t.merchant}" - $${amount} - Type: ${t.type}`;
    }).join('\n');

    return `You are an expert in categorizing personal expenses for Argentinian credit card transactions.

Analyze these credit card transactions and classify each one into ONE of these categories:

AVAILABLE CATEGORIES (choose ONE per transaction):
🏠 Hogar - Home services (rent, utilities: electricity, gas, water, internet)
🍔 Alimentación - Food and drinks (supermarkets, restaurants, delivery)  
🚗 Transporte - Transportation (fuel, public transport, taxis, car maintenance)
🎉 Ocio y Entretenimiento - Entertainment (streaming, cinema, events, games)
🏥 Salud - Health and medicine (pharmacies, medical consultations, health insurance)
👕 Compras Personales - Personal items (clothing, technology, accessories)
📚 Educación - Education (courses, books, educational subscriptions)
🐶 Mascotas - Pets (pet food, veterinary)
💼 Trabajo / Negocio - Work/Business tools (software, equipment)
🧾 Sin Categoría - Use ONLY when you cannot determine category with confidence

CLASSIFICATION RULES:
- SUPERMERCADO/MERCADO → Alimentación (#supermercado)
- FARMACIA/MEDICINA/FARMA → Salud (#medicamentos)
- Spotify/Netflix/streaming → Ocio y Entretenimiento (#streaming)  
- HOYTS/CINE → Ocio y Entretenimiento (#cine)
- ADIDAS/clothing/ropa → Compras Personales (#ropa)
- EXPRESO/BUS/TRANSPORTE → Transporte (#transporte_publico)
- MercadoPago: Classify by the ACTUAL merchant, ignore "MERCADOPAGO" prefix
- If confidence < 0.7 → Sin Categoría (#sin_clasificar)

TRANSACTIONS TO CLASSIFY:
${transactionList}

IMPORTANT: Respond ONLY with valid JSON, no additional text:
{
  "classifications": [
    {
      "index": 1,
      "description": "exact_original_description",
      "category": "category_name", 
      "tags": ["#main_tag"],
      "confidence": 0.85
    }
  ]
}`;
  }

  /**
   * Parse and validate LLM classification response  
   */
  private parseClassificationResponse(response: string | any): any[] {
    try {
      let parsedResponse;
      
      if (typeof response === 'string') {
        // Clean potential markdown formatting
        const cleanedResponse = response
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        parsedResponse = JSON.parse(cleanedResponse);
      } else {
        parsedResponse = response;
      }

      if (!parsedResponse.classifications || !Array.isArray(parsedResponse.classifications)) {
        throw new Error('Invalid response format: missing classifications array');
      }

      return parsedResponse.classifications.filter((classification: any) => 
        this.validateClassification(classification)
      );
      
    } catch (error) {
      console.error('   ❌ Failed to parse classification response:', error);
      console.error('   📄 Raw response:', response);
      throw new Error(`Failed to parse LLM classification response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Combine original transaction data with classification results
   */
  private mergeClassificationResults(
    originalTransactions: any[], 
    classifications: any[]
  ): CategorizedTransaction[] {
    return originalTransactions.map((transaction, index) => {
      // Find matching classification by index or description
      const classification = classifications.find(c => 
        c.index === index + 1 || 
        c.description === transaction.description ||
        c.description === transaction.merchant
      );

      return {
        ...transaction,
        category: classification?.category || "Sin Categoría",
        tags: classification?.tags || ["#sin_clasificar"],
        confidence: classification?.confidence || 0.0
      };
    });
  }

  /**
   * Calculate category breakdown statistics
   */
  private calculateCategoryBreakdown(transactions: CategorizedTransaction[]): CategoryBreakdown {
    const breakdown: CategoryBreakdown = {};
    const totalAmount = transactions.reduce((sum, t) => sum + this.getTransactionAmount(t), 0);

    // Initialize all categories
    Object.keys(this.CATEGORIES).forEach(category => {
      breakdown[category] = {
        total: 0,
        count: 0,
        percentage: 0
      };
    });

    // Calculate totals for each category
    transactions.forEach(transaction => {
      const category = transaction.category;
      const amount = this.getTransactionAmount(transaction);
      
      if (breakdown[category]) {
        breakdown[category].total += amount;
        breakdown[category].count += 1;
      }
    });

    // Calculate percentages
    Object.keys(breakdown).forEach(category => {
      if (totalAmount > 0) {
        breakdown[category].percentage = (breakdown[category].total / totalAmount) * 100;
      }
    });

    // Remove empty categories
    Object.keys(breakdown).forEach(category => {
      if (breakdown[category].count === 0) {
        delete breakdown[category];
      }
    });

    return breakdown;
  }

  /**
   * Normalize transaction amount (handle both Galicia and Pampa formats)
   */
  private getTransactionAmount(transaction: any): number {
    // Handle different amount formats
    if (typeof transaction.amount === 'number') {
      return Math.abs(transaction.amount); // Pampa format
    }
    
    if (typeof transaction.amountPesos === 'number') {
      return Math.abs(transaction.amountPesos); // Galicia format
    }
    
    if (typeof transaction.amountUSD === 'number') {
      return Math.abs(transaction.amountUSD * 1000); // Convert USD to approximate pesos
    }
    
    return 0; // Fallback
  }

  /**
   * Validate that classification makes sense
   */
  private validateClassification(classification: any): boolean {
    if (!classification || typeof classification !== 'object') {
      return false;
    }

    const requiredFields = ['category', 'tags', 'confidence'];
    for (const field of requiredFields) {
      if (!(field in classification)) {
        return false;
      }
    }

    // Validate category exists
    if (!Object.keys(this.CATEGORIES).includes(classification.category)) {
      return false;
    }

    // Validate confidence is a number between 0 and 1
    const confidence = parseFloat(classification.confidence);
    if (isNaN(confidence) || confidence < 0 || confidence > 1) {
      return false;
    }

    return true;
  }

  /**
   * Get category emoji for display purposes
   */
  getCategoryEmoji(category: string): string {
    const emojis: { [key: string]: string } = {
      "Hogar": "🏠",
      "Alimentación": "🍔", 
      "Transporte": "🚗",
      "Ocio y Entretenimiento": "🎉",
      "Salud": "🏥",
      "Compras Personales": "👕",
      "Educación": "📚",
      "Mascotas": "🐶", 
      "Trabajo / Negocio": "💼",
      "Sin Categoría": "🧾"
    };
    return emojis[category] || "📁";
  }
}