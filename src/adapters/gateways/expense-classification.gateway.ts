/**
 * Expense Classification Gateway Implementation
 *
 * Calls the LLM directly for transaction categorization.
 * No dependency on legacy ExpenseClassifier class.
 */

import {
  IExpenseClassificationGateway,
  IWebSearchGateway,
  GatewayResult,
  ClassificationRequest,
  ClassificationResult,
} from "../../use-cases/gateways/interfaces";
import { LLMExtractionGateway } from "./llm-extraction.gateway";

// Categories with their associated tags
const CATEGORIES: { [key: string]: { en: string; tags: string[] } } = {
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
    tags: ["#combustible", "#transporte_publico", "#uber", "#taxi", "#peajes", "#mantenimiento_auto", "#seguro_moto", "#seguro_auto"],
  },
  "Ocio y Entretenimiento": {
    en: "Entertainment",
    tags: ["#salidas", "#streaming", "#cine", "#eventos", "#juegos"],
  },
  Salud: {
    en: "Health",
    tags: ["#obra_social", "#seguro_medico", "#medicamentos", "#consultas_medicas"],
  },
  "Belleza y Cuidado Personal": {
    en: "Beauty & Personal Care",
    tags: ["#perfumeria", "#cosmetica", "#peluqueria", "#maquillaje", "#estetica", "#spa", "#cuidado_personal"],
  },
  Viajes: {
    en: "Travel",
    tags: ["#viajes", "#hotel", "#vuelo", "#excursion", "#turismo", "#alojamiento", "#tour", "#transporte_largo", "#parques_nacionales", "#aventura"],
  },
  Indumentaria: {
    en: "Clothing",
    tags: ["#ropa", "#calzado", "#accesorios_moda", "#indumentaria", "#moda", "#vestimenta"],
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

export class ExpenseClassificationGateway implements IExpenseClassificationGateway {
  constructor(
    private readonly llmExtractionGateway: LLMExtractionGateway,
    private readonly webSearchGateway?: IWebSearchGateway,
  ) {}

  async classifyExpenses(
    request: ClassificationRequest,
  ): Promise<GatewayResult<ClassificationResult>> {
    const startTime = Date.now();

    if (!request.transactions || !Array.isArray(request.transactions)) {
      return { success: false, error: "Transactions must be an array", metadata: { processingTime: Date.now() - startTime } };
    }

    if (!request.categories || !Array.isArray(request.categories)) {
      return { success: false, error: "Categories must be an array", metadata: { processingTime: Date.now() - startTime } };
    }

    if (request.transactions.length === 0) {
      return {
        success: true,
        data: { categorizedTransactions: [], uncategorizedTransactions: [], categoryBreakdown: {} },
        metadata: { processingTime: Date.now() - startTime },
      };
    }

    try {
      console.log(`   🔍 Analyzing ${request.transactions.length} transactions for categorization...`);

      const prompt = this.buildClassificationPrompt(request.transactions);
      const rawResponse = await this.llmExtractionGateway.callLLM(prompt);
      const classifications = this.parseClassificationResponse(rawResponse);

      // Enrichment pass for low-confidence transactions
      const enrichedClassifications = await this.enrichLowConfidenceTransactions(
        request.transactions,
        classifications,
      );

      const categorizedTransactions = request.transactions.map((tx: any, index: number) => {
        const match = enrichedClassifications.find(
          (c: any) => c.index === index + 1 || c.description === tx.description || c.description === tx.merchant,
        );
        return {
          transaction: {
            ...tx,
            category: match?.category || "Sin Categoría",
            tags: match?.tags || ["#sin_clasificar"],
            confidence: match?.confidence || 0.0,
          },
          category: match?.category || "Sin Categoría",
          confidence: match?.confidence || 0.0,
          tags: match?.tags || ["#sin_clasificar"],
          reasoning: `Classified as ${match?.category || "Sin Categoría"}`,
        };
      });

      const uncategorizedTransactions = categorizedTransactions
        .filter((ctx) => ctx.category === "Sin Categoría")
        .map((ctx) => ctx.transaction);

      const categoryBreakdown = this.buildCategoryBreakdown(categorizedTransactions);

      return {
        success: true,
        data: {
          categorizedTransactions,
          uncategorizedTransactions,
          categoryBreakdown,
        },
        metadata: {
          processingTime: Date.now() - startTime,
          totalTransactions: request.transactions.length,
          categorizedCount: categorizedTransactions.filter((c) => c.category !== "Sin Categoría").length,
          uncategorizedCount: uncategorizedTransactions.length,
          categorizationRate: categorizedTransactions.filter((c) => c.category !== "Sin Categoría").length / request.transactions.length,
          categoriesUsed: Object.keys(categoryBreakdown).length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Expense classification failed: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime: Date.now() - startTime },
      };
    }
  }

  async suggestCategories(transactionDescription: string): Promise<GatewayResult<Array<{ category: string; confidence: number; reasoning: string }>>> {
    const startTime = Date.now();

    if (!transactionDescription || transactionDescription.trim().length === 0) {
      return { success: false, error: "Transaction description cannot be empty", metadata: { processingTime: Date.now() - startTime } };
    }

    const result = await this.classifyExpenses({
      transactions: [{ date: new Date().toISOString().split("T")[0], description: transactionDescription, merchant: transactionDescription, amount: 100, type: "purchase" }],
      categories: Object.keys(CATEGORIES).map((name) => ({ name, tags: CATEGORIES[name].tags, description: CATEGORIES[name].en })),
      options: { confidenceThreshold: 0.1, allowMultipleCategories: true, includeReasons: true },
    });

    if (!result.success || !result.data) {
      return { success: false, error: `Category suggestion failed: ${result.error}`, metadata: { processingTime: Date.now() - startTime } };
    }

    const suggestions = result.data.categorizedTransactions
      .map((ctx: any) => ({ category: ctx.category, confidence: ctx.confidence, reasoning: ctx.reasoning || `Based on "${transactionDescription}"` }))
      .sort((a: any, b: any) => b.confidence - a.confidence)
      .slice(0, 5);

    return { success: true, data: suggestions, metadata: { processingTime: Date.now() - startTime, totalSuggestions: suggestions.length } };
  }

  async updateCategoryModel(feedback: Array<{ transaction: any; expectedCategory: string; actualCategory: string; confidence: number }>): Promise<GatewayResult<void>> {
    const startTime = Date.now();
    console.log("Received category feedback for model improvement:", { feedbackCount: feedback.length, timestamp: new Date().toISOString() });
    return { success: true, data: undefined, metadata: { processingTime: Date.now() - startTime, feedbackProcessed: feedback.length } };
  }

  private buildClassificationPrompt(transactions: any[]): string {
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
- Hogar — Rent, utilities (electricity, gas, water, internet, cable, telephone/mobile carrier), HOA fees, home insurance
- Alimentación — Supermarkets, restaurants, bars, cafes, food delivery (PedidosYa, Rappi, etc.)
- Transporte — Fuel (YPF, Shell, Axion), tolls, Uber/Cabify/DiDi, car repair, car insurance, motorcycle insurance, vehicle insurance cooperatives, public transport within a city
- Ocio y Entretenimiento — Streaming (Netflix, Spotify, Disney+, Max, Apple TV), cinema (Hoyts, Cinemark), concerts, sports events, video games, toy stores, children's entertainment
- Viajes — Hotels, flights, Airbnb, Booking, Despegar, travel agencies, excursions, tours, adventure tourism, national parks, long-distance buses (Andesmar, Flecha Bus, etc.), long-distance trains, Patagonia activities
- Salud — Pharmacies (Farmacity, Dr. Ahorro), prepaid medicine (OSDE, Swiss Medical), doctors, labs, gym
- Belleza y Cuidado Personal — Perfumeries (Juleriaque, L'Occitane, Sephora), cosmetics (MAC, Benefit), hairdressers, beauty salons, manicure, spas, personal care products
- Indumentaria — Clothing and footwear (Zara, H&M, Nike, Adidas, Rapsodia, Kosiuko, Mimo, Portsaid), accessories (bags, belts), eyewear
- Compras Personales — Electronics (Garbarino, Frávega, Apple, Samsung), home decor, sporting goods (no clothing), general online marketplaces (MercadoLibre when product is unclear), specialty artisan products (sahumerios, incienso, artesanías, mate)
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
11. **Payment platform prefixes — SIRO and PAGOS360**: Work exactly like MERPAGO. The real merchant is the part AFTER the dot. Example: "SIRO.VELONET" → merchant is "VELONET" (ISP = internet provider) → Hogar. "PAGOS360.CORPICO" → cooperative service → Hogar. "CAMUZZI" or "CAMUZZIGASP" → Camuzzi Gas (Argentine gas utility) → Hogar.
12. **Vehicle/motorcycle insurance cooperatives**: Names containing "COOPERACIONSEG", "COOPERATIVA" + "SEG", or similar cooperative insurance patterns → Transporte (#seguro_moto or #seguro_auto). If clearly a health insurance cooperative → Salud.
13. **P2P transfers via KMERPAGO with person names**: "KMERPAGO.<FIRSTNAME><LASTNAME>" or "KMERPAGO.<LASTNAME><FIRSTNAME>" patterns where the sub-name is a person's name (not a business) → Sin Categoría (#transferencia_p2p). Examples: KMERPAGO.NORBERTOALEXISGON, KMERPAGO.NICOLASAXELSTAGNA. **EXCEPTION**: Known merchants listed in the few-shots below take priority over this rule (e.g. MARIANAHAYDEEFERR = sahumerios/artisan → Compras Personales, MARIAVICTORIADIEG = dentista → Salud, MENDICOADIANAYANE = artesanías → Compras Personales, ALEXISJORGECAMPAG = peluquería → Belleza y Cuidado Personal).

## SEMANTIC REASONING FOR UNKNOWN MERCHANTS
When you don't recognize a merchant name, reason about it before classifying:

**Decompose the name into parts:**
- "KINDERLAND" → Kinder (children in German/Italian) + land (place) → children's store/toy store → Ocio y Entretenimiento (#juguetes, #infantil)
- "HIELO Y AVENTURA" → hielo (ice/glacier) + aventura (adventure) → adventure tourism in Patagonia (e.g. Perito Moreno glacier tours) → Viajes
- "VIENTO OESTE" → viento oeste (west wind) → evokes Patagonia geography; combined with similar transaction context → likely travel/tourism agency → Viajes
- "WWWVENTAWEBAPNGOBAR" → tokenize: VENTA+WEB+APN+GOB+AR → APN = Administración de Parques Nacionales + GOB.AR = Argentine government → Viajes (#parques_nacionales, #turismo)

**Evocative name patterns → Viajes:**
- Names with: montaña, glaciar, hielo, patagoni, andino, sierra, lago, río, expedicion, aventura, trek, rafting, kayak, safari → Viajes
- Names with: hostel, lodge, cabañas, posada, apart, resort, inn → Viajes (#alojamiento)
- NOTE: "MONTAGNE" alone is NOT Viajes — it is an Argentine outdoor/sportswear clothing brand → Indumentaria

**Unknown boutique / tienda names → Indumentaria:**
- Short evocative names that sound like boutiques or personal brand names (e.g. "ROQUE NUBLO", "HOPE", "PIRIPOSA", "ILUSIONES", "LUNA") with no other cues → lean toward Indumentaria. Use confidence 0.6.

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
| MONTAGNE | Indumentaria | [#ropa, #indumentaria] | 0.90 |
| MONTAGNE PICO | Indumentaria | [#ropa, #indumentaria] | 0.90 |
| HOPE | Indumentaria | [#ropa, #moda] | 0.80 |
| PIRIPOSA | Indumentaria | [#ropa, #moda] | 0.75 |
| ROQUE NUBLO | Indumentaria | [#ropa, #moda] | 0.75 |
| KMERPAGO.CAPITANOCRAFT | Alimentación | [#restaurante, #comida] | 0.75 |
| KMERPAGO.ALEXISJORGECAMPAG | Belleza y Cuidado Personal | [#peluqueria, #cuidado_personal] | 0.60 |
| KMERPAGO.COOPERACIONSEG | Transporte | [#seguro_moto, #seguro] | 0.72 |
| KMERPAGO.CAMUZZIGASPAMP | Hogar | [#gas, #servicios] | 0.90 |
| CAMUZZI | Hogar | [#gas, #servicios] | 0.95 |
| SIRO.VELONET | Hogar | [#internet, #servicios] | 0.85 |
| PAGOS360.CORPICO | Hogar | [#servicios] | 0.72 |
| TUENTI | Hogar | [#telefonia, #internet] | 0.90 |
| KMERPAGO.NORBERTOALEXISGON | Sin Categoría | [#transferencia_p2p] | 0.95 |
| KMERPAGO.TODOSUELTO | Alimentación | [#dietética, #almacén] | 0.80 |
| KMERPAGO.LOS22 | Alimentación | [#almacén, #despensa] | 0.80 |
| KMERPAGO.MARIANAHAYDEEFERR | Compras Personales | [#sahumerios, #artesanias] | 0.90 |
| KMERPAGO.MARIAVICTORIADIEG | Salud | [#dentista, #consulta_medica] | 0.85 |
| KMERPAGO.MENDICOADIANAYANE | Compras Personales | [#artesanias, #mates] | 0.75 |

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

  private parseClassificationResponse(response: string): any[] {
    const cleaned = response
      .replace(/```json\s*/g, "")
      .replace(/```\s*$/g, "")
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON found in classification response");
      parsed = JSON.parse(match[0]);
    }

    if (!parsed.classifications || !Array.isArray(parsed.classifications)) {
      throw new Error("Invalid response format: missing classifications array");
    }

    const availableCategories = Object.keys(CATEGORIES);
    const valid = parsed.classifications.filter((c: any) => {
      if (!c || typeof c !== "object") return false;
      if (!("category" in c) || !("tags" in c) || !("confidence" in c)) return false;
      if (!availableCategories.includes(c.category)) return false;
      const conf = parseFloat(c.confidence);
      return !isNaN(conf) && conf >= 0 && conf <= 1;
    });

    console.log(`   ✅ Valid classifications: ${valid.length}/${parsed.classifications.length}`);
    return valid;
  }

  private buildCategoryBreakdown(categorizedTransactions: any[]): Record<string, { count: number; totalAmount: number; averageConfidence: number }> {
    const breakdown: Record<string, { count: number; totalAmount: number; averageConfidence: number }> = {};

    for (const ctx of categorizedTransactions) {
      const cat = ctx.category;
      if (!breakdown[cat]) {
        breakdown[cat] = { count: 0, totalAmount: 0, averageConfidence: 0 };
      }
      breakdown[cat].count += 1;
      breakdown[cat].totalAmount += this.getTransactionAmount(ctx.transaction);
      breakdown[cat].averageConfidence += ctx.confidence;
    }

    for (const cat of Object.keys(breakdown)) {
      breakdown[cat].averageConfidence = breakdown[cat].averageConfidence / breakdown[cat].count;
    }

    return breakdown;
  }

  private getTransactionAmount(transaction: any): number {
    if (typeof transaction.amountPesos === "number" && transaction.amountPesos !== 0) return transaction.amountPesos;
    if (typeof transaction.amountDollars === "number" && transaction.amountDollars !== 0) return transaction.amountDollars * 1000;
    if (typeof transaction.amount === "number") return transaction.amount;
    return 0;
  }

  // ── Enrichment helpers ──────────────────────────────────────────────────────

  private async enrichLowConfidenceTransactions(
    transactions: any[],
    classifications: any[],
  ): Promise<any[]> {
    if (!this.webSearchGateway) return classifications;

    // Build list of low-confidence items with original index into classifications[]
    const lowConfidenceItems = classifications
      .map((c, i) => ({ classIdx: i, classification: c }))
      .filter(({ classification: c }) => (c.confidence ?? 0) < 0.70);

    if (lowConfidenceItems.length === 0) return classifications;

    // Run parallel searches — never throw
    const searchResults = await Promise.allSettled(
      lowConfidenceItems.map(({ classification: c }) => {
        const merchant = c.description ?? "";
        return this.webSearchGateway!.search(merchant);
      }),
    );

    // Build index→snippet map — keep only snippets >= 20 chars
    const snippetsByIdx = new Map<number, string>();
    lowConfidenceItems.forEach(({ classIdx }, i) => {
      const result = searchResults[i];
      if (result.status === "fulfilled" && result.value.length >= 20) {
        snippetsByIdx.set(classIdx, result.value);
      }
    });

    if (snippetsByIdx.size === 0) return classifications;

    // Build enrichment subset — only items with a useful snippet
    const enrichableItems = lowConfidenceItems.filter(({ classIdx }) => snippetsByIdx.has(classIdx));
    const lowConfTxs = enrichableItems.map(({ classIdx }) => {
      const c = classifications[classIdx];
      return transactions.find(
        (tx: any, txIdx: number) =>
          c.index === txIdx + 1 ||
          c.description === tx.description ||
          c.description === tx.merchant,
      ) ?? {};
    });

    if (lowConfTxs.length === 0) return classifications;

    const enrichmentPrompt = this.buildEnrichmentPrompt(lowConfTxs, enrichableItems.map(({ classIdx }) => snippetsByIdx.get(classIdx)!));

    try {
      const rawResponse = await this.llmExtractionGateway.callLLM(enrichmentPrompt);
      const enriched = this.parseEnrichmentResponse(rawResponse);

      // Merge enriched results back by subset index
      const merged = [...classifications];
      enriched.forEach((e: any) => {
        const item = enrichableItems[e.index - 1];
        if (!item) return;
        merged[item.classIdx] = {
          ...merged[item.classIdx],
          category: e.category ?? merged[item.classIdx].category,
          confidence: e.confidence ?? merged[item.classIdx].confidence,
          tags: e.tags ?? merged[item.classIdx].tags,
        };
      });

      return merged;
    } catch (err) {
      console.warn("[ExpenseClassificationGateway] Enrichment LLM parse error — keeping originals:", err);
      return classifications;
    }
  }

  private buildEnrichmentPrompt(
    transactions: any[],
    snippets: string[],
  ): string {
    const items = transactions
      .map((tx, i) => {
        const merchantKey = tx.description ?? tx.merchant ?? "";
        const snippet = snippets[i] ?? "";
        const amount = tx.amountPesos != null
          ? `$${tx.amountPesos}`
          : tx.amountDollars != null
            ? `U$S${tx.amountDollars}`
            : "unknown";
        return `${i + 1}. "${merchantKey}" — amount: ${amount}\n   Web context: ${snippet}`;
      })
      .join("\n");

    return `You are a financial transaction classifier. Re-classify the following low-confidence transactions using the provided web context.

## TRANSACTIONS TO RE-CLASSIFY
${items}

## AVAILABLE CATEGORIES (exact Spanish names):
Hogar, Alimentación, Transporte, Ocio y Entretenimiento, Salud, Belleza y Cuidado Personal, Viajes, Indumentaria, Compras Personales, Educación, Mascotas, Trabajo / Negocio, Descuentos, Sin Categoría

## OUTPUT FORMAT
Respond ONLY with valid JSON (no markdown, no extra text):
{
  "enriched": [
    { "index": 1, "category": "Salud", "confidence": 0.85, "tags": ["#farmacia"] }
  ]
}

Use the web context to assign the correct category with higher confidence. The index corresponds to the position in the list above.`;
  }

  private parseEnrichmentResponse(response: string): any[] {
    const cleaned = response
      .replace(/```json\s*/g, "")
      .replace(/```\s*$/g, "")
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON found in enrichment response");
      parsed = JSON.parse(match[0]);
    }

    if (!parsed.enriched || !Array.isArray(parsed.enriched)) {
      throw new Error("Invalid enrichment response: missing enriched array");
    }

    return parsed.enriched;
  }
}
