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
import { getClassificationPrompt } from "../../prompts/expense-classification.prompt";

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

    return getClassificationPrompt(transactionList);
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
