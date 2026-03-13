import { BaseExtractor } from "../extractors/base.extractor";
import {
  CategorizedStatement,
  CategorizedTransaction,
  CategoryBreakdown,
  ClassificationResult,
} from "../types/credit-card.types";

/**
 * ExpenseClassifier - Categorizes credit card transactions into expense categories
 * Uses LLM to analyze transaction descriptions and assign appropriate categories
 */
export class ExpenseClassifier {
  private extractor: BaseExtractor;

  // Category mappings with Spanish to English translation
  private readonly CATEGORIES: {
    [key: string]: { en: string; tags: string[] };
  } = {
    Hogar: {
      en: "Home",
      tags: ["#alquiler", "#expensas", "#luz", "#gas", "#agua", "#internet"],
    },
    Alimentación: {
      en: "Food",
      tags: ["#supermercado", "#restaurantes", "#delivery", "#cafe", "#snacks"],
    },
    Transporte: {
      en: "Transport",
      tags: [
        "#combustible",
        "#transporte_publico",
        "#uber",
        "#taxi",
        "#peajes",
        "#mantenimiento_auto",
      ],
    },
    "Ocio y Entretenimiento": {
      en: "Entertainment",
      tags: ["#salidas", "#streaming", "#cine", "#eventos", "#juegos"],
    },
    Salud: {
      en: "Health",
      tags: [
        "#obra_social",
        "#seguro_medico",
        "#medicamentos",
        "#consultas_medicas",
      ],
    },
    "Belleza y Cuidado Personal": {
      en: "Beauty & Personal Care",
      tags: [
        "#perfumeria",
        "#cosmetica",
        "#peluqueria",
        "#maquillaje",
        "#estetica",
        "#spa",
        "#cuidado_personal",
      ],
    },
    Viajes: {
      en: "Travel",
      tags: [
        "#viajes",
        "#hotel",
        "#vuelo",
        "#excursion",
        "#turismo",
        "#alojamiento",
        "#tour",
        "#transporte_largo",
        "#parques_nacionales",
        "#aventura",
      ],
    },
    Indumentaria: {
      en: "Clothing",
      tags: [
        "#ropa",
        "#calzado",
        "#accesorios_moda",
        "#indumentaria",
        "#moda",
        "#vestimenta",
      ],
    },
    "Compras Personales": {
      en: "Personal Shopping",
      tags: ["#tecnologia", "#electronica", "#hogar_deco", "#accesorios"],
    },
    Educación: {
      en: "Education",
      tags: ["#cursos", "#libros", "#suscripciones_educativas"],
    },
    Mascotas: {
      en: "Pets",
      tags: ["#alimento_mascota", "#veterinario"],
    },
    "Trabajo / Negocio": {
      en: "Work/Business",
      tags: ["#software", "#herramientas", "#equipamiento"],
    },
    Descuentos: {
      en: "Discounts",
      tags: ["#descuento", "#promocion", "#rebate", "#cashback", "#reintegro"],
    },
    "Sin Categoría": {
      en: "Uncategorized",
      tags: ["#sin_clasificar"],
    },
  };

  constructor(extractor: BaseExtractor) {
    this.extractor = extractor;
  }

  /**
   * Main method: Classify all transactions in extracted data
   */
  async classifyTransactions(
    extractedData: any,
  ): Promise<ClassificationResult> {
    const startTime = Date.now();

    try {
      console.log("   🔍 Analyzing transactions for categorization...");

      if (
        !extractedData.transactions ||
        !Array.isArray(extractedData.transactions)
      ) {
        throw new Error("No transactions found in extracted data");
      }

      const transactions = extractedData.transactions;
      console.log(
        `   📊 Found ${transactions.length} transactions to classify`,
      );

      // Generate classification prompt
      const prompt = this.generateClassificationPrompt(transactions);
      console.log(
        `   📝 Generated classification prompt (${prompt.length} chars)`,
      );

      // Call LLM for classification
      const classificationResponse = await (this.extractor as any).extractData(
        prompt,
      );

      // Parse response
      const classifications = this.parseClassificationResponse(
        classificationResponse,
      );
      console.log(`   ✅ Parsed ${classifications.length} classifications`);

      // Merge original data with classifications
      const categorizedTransactions = this.mergeClassificationResults(
        transactions,
        classifications,
      );

      // Calculate category breakdown
      const categoryBreakdown = this.calculateCategoryBreakdown(
        categorizedTransactions,
      );

      // Build categorized statement
      const categorizedStatement: CategorizedStatement = {
        ...extractedData,
        transactions: categorizedTransactions,
        categoryBreakdown,
        classificationMetadata: {
          processingTime: Date.now() - startTime,
          totalTransactions: transactions.length,
          categorizedTransactions: categorizedTransactions.filter(
            (t) => t.category !== "Sin Categoría",
          ).length,
          uncategorizedTransactions: categorizedTransactions.filter(
            (t) => t.category === "Sin Categoría",
          ).length,
        },
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        data: categorizedStatement,
        metadata: {
          processingTime,
          provider: (this.extractor as any).config?.provider || "unknown",
          model: (this.extractor as any).config?.model || "unknown",
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown classification error",
        metadata: {
          processingTime,
          provider: (this.extractor as any).config?.provider || "unknown",
          model: (this.extractor as any).config?.model || "unknown",
        },
      };
    }
  }

  /**
   * Generate classification prompt for LLM
   */
  private generateClassificationPrompt(transactions: any[]): string {
    const transactionList = transactions
      .map((t, index) => {
        const amount = this.getTransactionAmount(t);
        return `${index + 1}. "${t.description || t.merchant}" - $${amount} - Type: ${t.type}`;
      })
      .join("\n");

    return `You are an expert financial analyst specializing in categorizing Argentinian credit card transactions.

## YOUR MAIN TASK
Use your broad knowledge of brands, stores, websites and businesses (local and international) to identify the business type of each transaction and assign the most appropriate category. Descriptions may be abbreviated merchant names, URLs, or store codes — use your general knowledge AND semantic reasoning about the name to infer the business.

## URL / DOMAIN PARSING
When you see a URL or domain (e.g. "WWW.JULERIAQUE.COM.A", "WWW.MANGO.COM"), extract the brand name (JULERIAQUE, MANGO) and classify based on what that brand/business sells.

For dense concatenated URLs like "WWWVENTAWEBAPNGOBAR", split into tokens: WWW + VENTA + WEB + APN + GOB + AR → APN (Administración de Parques Nacionales) + GOB.AR (official Argentine government site) → Viajes.

## AVAILABLE CATEGORIES (use the exact Spanish name, no emojis):
- Hogar — Rent, utilities (electricity, gas, water, internet, cable), HOA fees
- Alimentación — Supermarkets, restaurants, bars, cafes, food delivery (PedidosYa, Rappi, etc.)
- Transporte — Fuel (YPF, Shell, Axion), tolls, Uber/Cabify/DiDi, car repair, car insurance, public transport within a city
- Ocio y Entretenimiento — Streaming (Netflix, Spotify, Disney+, Max, Apple TV), cinema (Hoyts, Cinemark), concerts, sports events, video games, toy stores, children's entertainment
- Viajes — Hotels, flights, Airbnb, Booking, Despegar, travel agencies, excursions, tours, adventure tourism, national parks, long-distance buses (Andesmar, Flecha Bus, etc.), long-distance trains, Patagonia activities
- Salud — Pharmacies (Farmacity, Dr. Ahorro), prepaid medicine (OSDE, Swiss Medical), doctors, labs, gym
- Belleza y Cuidado Personal — Perfumeries (Juleriaque, L'Occitane, Sephora), cosmetics (MAC, Benefit), hairdressers, beauty salons, manicure, spas, personal care products
- Indumentaria — Clothing and footwear (Zara, H&M, Nike, Adidas, Rapsodia, Kosiuko, Mimo, Portsaid), accessories (bags, belts), eyewear
- Compras Personales — Electronics (Garbarino, Frávega, Apple, Samsung), home decor, sporting goods (no clothing), general online marketplaces (MercadoLibre when product is unclear)
- Educación — Universities, language schools (English, etc.), online courses (Udemy, Coursera), educational books, EdTech platforms
- Mascotas — Veterinaries, pet shops, pet food brands
- Trabajo / Negocio — SaaS tools (Adobe, Microsoft 365, Slack, Notion), domain/hosting, professional equipment, coworking
- Descuentos — Negative amounts that are discounts, cashbacks, rebates, reintegros, promotional credits
- Sin Categoría — Use ONLY when you truly cannot determine the category even after semantic reasoning

## CLASSIFICATION RULES
1. **Use general knowledge first**: If you know the brand/business (e.g. Juleriaque = perfumery, Rappi = food delivery, YPF = fuel, Farmacity = pharmacy), classify with high confidence.
2. **URL extraction**: Strip "WWW.", ".COM.AR", ".COM.A", ".COM" to get the brand name, then classify.
3. **MercadoPago / MercadoLibre prefix**: The actual merchant is the part AFTER "MERCADOPAGO ", "MERPAGO.", "MERPAGO*", or "ML ". Classify based on that sub-merchant, not the payment platform. Example: "MERPAGO.KINDERLAND" → merchant is "KINDERLAND".
4. **Farmacity**: Goes to Salud (it's a pharmacy, even though it sells cosmetics).
5. **Negative amounts / rebates / REINTEGRO / CASHBACK / DESCUENTO**: Always → Descuentos.
6. **PAGO / DEBITO AUTOMATICO**: Keep as-is if type=payment.
7. **Indumentaria vs Compras Personales**: Clothing/fashion brands → Indumentaria. Electronics, home goods, general goods → Compras Personales.
8. **Belleza vs Salud**: Perfumeries and cosmetic brands → Belleza y Cuidado Personal. Pharmacies and medical-focused businesses → Salud.
9. **Transporte vs Viajes**: City transport (Uber, colectivo, subte, taxi, fuel) → Transporte. Long-distance travel, accommodation, excursions, tours → Viajes.
10. **Confidence**: Assign ≥ 0.8 when you know the brand, 0.6–0.79 when reasonably sure, 0.4–0.59 when inferred from semantic reasoning. Only use Sin Categoría if confidence < 0.4.

## SEMANTIC REASONING FOR UNKNOWN MERCHANTS
When you don't recognize a merchant name, reason about it before classifying:

**Decompose the name into parts:**
- "KINDERLAND" → Kinder (children in German/Italian) + land (place) → children's store/toy store → Ocio y Entretenimiento (#juguetes, #infantil)
- "HIELO Y AVENTURA" → hielo (ice/glacier) + aventura (adventure) → adventure tourism in Patagonia (e.g. Perito Moreno glacier tours) → Viajes
- "VIENTO OESTE" → viento oeste (west wind) → evokes Patagonia geography; combined with similar transaction context → likely travel/tourism agency → Viajes
- "WWWVENTAWEBAPNGOBAR" → tokenize: VENTA+WEB+APN+GOB+AR → APN = Administración de Parques Nacionales + GOB.AR = Argentine government → Viajes (#parques_nacionales, #turismo)

**Evocative name patterns → Viajes:**
- Names with: montaña, glaciar, hielo, patagoni, andino, pampa, sierra, lago, río, expedicion, aventura, trek, rafting, kayak, safari → Viajes
- Names with: hostel, lodge, cabañas, posada, apart, resort, inn → Viajes (#alojamiento)

**Evocative name patterns → Ocio y Entretenimiento:**
- Names with: kinder, kids, niños, infantil, juguete, toy, play, game, parque_diversion → Ocio y Entretenimiento (#infantil, #juguetes)

## FEW-SHOT EXAMPLES
| Description | Category | Tags | Confidence |
|---|---|---|---|
| WWW.JULERIAQUE.COM.A | Belleza y Cuidado Personal | [#perfumeria, #cosmetica] | 0.95 |
| MERPAGO.KINDERLAND | Ocio y Entretenimiento | [#juguetes, #infantil] | 0.72 |
| WWWVENTAWEBAPNGOBAR | Viajes | [#turismo, #parques_nacionales] | 0.78 |
| HIELO Y AVENTURA SA | Viajes | [#excursion, #turismo, #aventura] | 0.82 |
| VIENTO OESTE | Viajes | [#turismo, #excursion] | 0.65 |
| MERCADOPAGO RAPPI | Alimentación | [#delivery] | 0.90 |
| NETFLIX | Ocio y Entretenimiento | [#streaming] | 0.99 |
| YPF PALERMO | Transporte | [#combustible] | 0.98 |
| FARMACITY | Salud | [#farmacia, #medicamentos] | 0.92 |
| ZARA ARGENTINA | Indumentaria | [#ropa, #moda] | 0.97 |
| APPLE.COM/BILL | Ocio y Entretenimiento | [#streaming] | 0.85 |
| FRÁVEGA | Compras Personales | [#tecnologia, #electronica] | 0.95 |
| HOYTS ABASTO | Ocio y Entretenimiento | [#cine] | 0.99 |
| OSDE | Salud | [#obra_social, #seguro_medico] | 0.99 |
| UBER | Transporte | [#uber] | 0.99 |
| REINTEGRO VISA | Descuentos | [#reintegro, #cashback] | 0.99 |
| DR. AHORRO | Salud | [#farmacia, #medicamentos] | 0.93 |
| L'OCCITANE | Belleza y Cuidado Personal | [#cosmetica, #perfumeria] | 0.97 |
| ADIDAS OFFICIAL | Indumentaria | [#calzado, #indumentaria] | 0.96 |
| NOTION.SO | Trabajo / Negocio | [#software] | 0.95 |
| DESPEGAR.COM | Viajes | [#vuelo, #hotel] | 0.99 |
| BOOKING.COM | Viajes | [#hotel, #alojamiento] | 0.99 |
| AIRBNB | Viajes | [#alojamiento] | 0.99 |
| FLYBONDI | Viajes | [#vuelo] | 0.99 |
| ANDESMAR | Viajes | [#transporte_largo] | 0.90 |
| MERPAGO ELAGUILA | Alimentación | [#supermercado] | 0.90 |
| EL AGUILA | Alimentación | [#supermercado] | 0.90 |

## TRANSACTIONS TO CLASSIFY
${transactionList}

## OUTPUT FORMAT
Respond ONLY with valid JSON (no markdown, no extra text):

{
  "classifications": [
    {
      "index": 1,
      "description": "exact_original_description",
      "category": "Belleza y Cuidado Personal",
      "tags": ["#perfumeria", "#cosmetica"],
      "confidence": 0.95
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

      if (typeof response === "string") {
        // Clean potential markdown formatting
        const cleanedResponse = response
          .replace(/```json\s*/g, "")
          .replace(/```\s*$/g, "")
          .trim();

        parsedResponse = JSON.parse(cleanedResponse);
      } else {
        parsedResponse = response;
      }

      if (
        !parsedResponse.classifications ||
        !Array.isArray(parsedResponse.classifications)
      ) {
        console.error("   ❌ Invalid response format: missing classifications array");
        console.error("   📄 Available fields in response:", Object.keys(parsedResponse));
        throw new Error(
          "Invalid response format: missing classifications array",
        );
      }

      // Validate each classification and log results
      const validClassifications = parsedResponse.classifications.filter((classification: any, index: number) => {
        const isValid = this.validateClassification(classification);
        if (!isValid) {
          console.log(`   ⚠️  Classification ${index + 1} failed validation - Category: '${classification.category}' (expected no emojis)`);
        }
        return isValid;
      });

      console.log(`   🔍 Valid classifications: ${validClassifications.length}/${parsedResponse.classifications.length}`);

      return validClassifications;
    } catch (error) {
      console.error("   ❌ Failed to parse classification response:", error);
      console.error("   📄 Raw response:", typeof response === 'string' ? response.substring(0, 200) + '...' : JSON.stringify(response, null, 2).substring(0, 200) + '...');
      throw new Error(
        `Failed to parse LLM classification response: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Combine original transaction data with classification results
   */
  private mergeClassificationResults(
    originalTransactions: any[],
    classifications: any[],
  ): CategorizedTransaction[] {
    return originalTransactions.map((transaction, index) => {
      // Find matching classification by index or description
      const classification = classifications.find(
        (c) =>
          c.index === index + 1 ||
          c.description === transaction.description ||
          c.description === transaction.merchant,
      );

      return {
        ...transaction,
        category: classification?.category || "Sin Categoría",
        tags: classification?.tags || ["#sin_clasificar"],
        confidence: classification?.confidence || 0.0,
      };
    });
  }

  /**
   * Calculate category breakdown statistics (exclude payments, include discounts)
   */
  private calculateCategoryBreakdown(
    transactions: CategorizedTransaction[],
  ): CategoryBreakdown {
    const breakdown: CategoryBreakdown = {};
    
    // Filter out payments but include discounts/credits
    const relevantTransactions = transactions.filter(t => 
      t.type !== 'payment' // Exclude actual credit card payments
    );
    
    const totalAmount = relevantTransactions.reduce(
      (sum, t) => sum + this.getTransactionAmount(t),
      0,
    );

    // Initialize all categories
    Object.keys(this.CATEGORIES).forEach((category) => {
      breakdown[category] = {
        total: 0,
        count: 0,
        percentage: 0,
      };
    });

    // Calculate totals for each category
    relevantTransactions.forEach((transaction) => {
      const category = transaction.category;
      const amount = this.getTransactionAmount(transaction);

      if (breakdown[category]) {
        breakdown[category].total += amount;
        breakdown[category].count += 1;
      }
    });

    // Calculate percentages
    Object.keys(breakdown).forEach((category) => {
      if (totalAmount > 0) {
        breakdown[category].percentage =
          (breakdown[category].total / totalAmount) * 100;
      }
    });

    // Remove empty categories
    Object.keys(breakdown).forEach((category) => {
      if (breakdown[category].count === 0) {
        delete breakdown[category];
      }
    });

    return breakdown;
  }

  /**
   * Get transaction amount (preserve sign for discount/payment detection)
   */
  private getTransactionAmount(transaction: any): number {
    // Handle different amount formats - preserve negative amounts
    if (typeof transaction.amount === "number") {
      return transaction.amount; // Pampa format - preserve sign
    }

    if (typeof transaction.amountPesos === "number") {
      return transaction.amountPesos; // Galicia format - preserve sign
    }

    if (typeof transaction.amountUSD === "number") {
      return transaction.amountUSD * 1000; // Convert USD to approximate pesos - preserve sign
    }

    return 0; // Fallback
  }

  /**
   * Validate that classification makes sense
   */
  private validateClassification(classification: any): boolean {
    if (!classification || typeof classification !== "object") {
      return false;
    }

    const requiredFields = ["category", "tags", "confidence"];
    for (const field of requiredFields) {
      if (!(field in classification)) {
        return false;
      }
    }

    // Validate category exists (without emojis)
    const availableCategories = Object.keys(this.CATEGORIES);
    if (!availableCategories.includes(classification.category)) {
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
      Hogar: "🏠",
      Alimentación: "🍔",
      Transporte: "🚗",
      "Ocio y Entretenimiento": "🎉",
      Salud: "🏥",
      "Belleza y Cuidado Personal": "💄",
      Viajes: "✈️",
      Indumentaria: "👕",
      "Compras Personales": "🛍️",
      Educación: "📚",
      Mascotas: "🐶",
      "Trabajo / Negocio": "💼",
      Descuentos: "💸",
      "Sin Categoría": "🧾",
    };
    return emojis[category] || "📁";
  }
}
