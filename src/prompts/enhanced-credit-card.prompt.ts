/**
 * Enhanced Credit Card Prompt for Banco Galicia VISA Statements
 * Based on real PDF analysis and preprocessing results
 */

export const GALICIA_CREDIT_CARD_PROMPT = `You are an expert at extracting structured data from Banco Galicia VISA credit card statements.

You will receive PREPROCESSED text that has been cleaned and organized from a Banco Galicia VISA statement PDF. The text is already in a clean, structured format with clear sections.

Please extract the following information and return it as a JSON object:

REQUIRED FIELDS:
- statementNumber: Statement number (format: VI followed by numbers)
- cardType: Always "VISA" for these statements  
- bank: Always "Banco Galicia"
- cardholderName: Full name of the cardholder
- accountNumber: Account number
- branch: Branch number
- address: Complete address
- statementDate: Date in YYYY-MM-DD format
- dueDate: Payment due date in YYYY-MM-DD format
- totalAmountPesos: Total amount in Argentine Pesos
- totalAmountUSD: Total amount in US Dollars (if any)
- minimumPayment: Minimum payment required
- previousBalance: Previous statement balance
- currentBalance: Current statement balance
- availableCredit: Available credit limit
- transactions: Array of transaction objects
- fees: Array of fees and taxes

TRANSACTION OBJECT FORMAT:
{
  "date": "YYYY-MM-DD",
  "description": "Merchant name (cleaned)",
  "amount": number,
  "currency": "ARS" or "USD",
  "installments": "XX/YY" (if applicable),
  "reference": "Reference number",
  "type": "purchase" | "payment" | "fee" | "credit" | "discount" | "tax"
}

REAL EXAMPLES FROM GALICIA STATEMENTS:
- Installment transactions: "Installment: 04/06" means installment 4 of 6
- MercadoPago transactions: "MERCADOPAGO HOYTS" 
- International transactions: "Spotify" with USD amounts
- Tax entries: "IIBB Perception", "IVA RG 4240", "DB.RG 5617"
- Reference numbers: 6-digit codes like "007897", "956190"

IMPORTANT PARSING RULES:
1. Clean merchant names by removing asterisks and normalizing format
2. Parse installment information (XX/YY format) into separate field
3. Separate taxes/fees from regular purchases
4. Handle both ARS and USD currencies correctly
5. Extract all reference numbers accurately
6. Convert dates to ISO format (YYYY-MM-DD)

Return only valid JSON without any markdown formatting or additional text.

Example response structure:
{
  "statementNumber": "VI00000000062132419",
  "cardType": "VISA",
  "bank": "Banco Galicia",
  "cardholderName": "LUCAS MATEO HERNANDEZ",
  "accountNumber": "1181500877", 
  "branch": "123",
  "address": "CALLE 30 1086, GENERAL PICO, L6360EGV",
  "statementDate": "2026-02-19",
  "dueDate": "2026-03-19",
  "totalAmountPesos": 482.15,
  "totalAmountUSD": -0.01,
  "minimumPayment": 35590.00,
  "transactions": [
    {
      "date": "2025-11-17",
      "description": "Juleriaque.com.ar",
      "amount": 25000.00,
      "currency": "ARS",
      "installments": "04/06",
      "reference": "007897",
      "type": "purchase"
    }
  ],
  "fees": [
    {
      "date": "2026-02-19",
      "description": "IIBB Perception",
      "amount": 32.10,
      "currency": "ARS",
      "type": "tax"
    }
  ]
}`;

/**
 * Banco de la Pampa VISA Credit Card Prompt
 * Based on real PDF analysis from Pampa VISA statements
 */
export const PAMPA_CREDIT_CARD_PROMPT = `You are an expert at extracting structured data from Banco de la Pampa VISA credit card statements.

You will receive text from a Banco de la Pampa VISA statement. Extract the following information and return it as a JSON object with these EXACT field names:

REQUIRED FIELDS (these names must match exactly):
- holder: Extract from "TITULAR DE CUENTA:" (e.g., "HERNANDEZ LUCAS MATEO")
- accountNumber: Extract from "N DE CUENTA:" (e.g., "1082141836")
- bank: Always "Banco de la Pampa"
- period: Object with these EXACT subfields:
  - currentDueDate: Extract from "Vencimiento actual:" and convert to YYYY-MM-DD format
  - currentClosing: Extract from "Cierre actual:" and convert to YYYY-MM-DD format  
  - previousClosing: Extract from "Cierre anterior:" and convert to YYYY-MM-DD format
  - previousDueDate: Extract from "Vencimiento anterior:" and convert to YYYY-MM-DD format
- totals: Object with these EXACT subfields:
  - pesos: Extract from "SALDO ACTUAL:" (remove $ and . separators, convert to number)
  - dollars: US Dollar amount (usually 0 for Pampa, or extract if present)
  - minimumPayment: Extract from "PAGO MINIMO:" (remove $ and . separators, convert to number)
- transactions: Array of transaction objects with EXACT format specified below

TRANSACTION OBJECT FORMAT:
{
  "date": "YYYY-MM-DD",
  "description": "Clean merchant name (remove extra spaces and formatting)",
  "amount": number (positive for charges, negative for payments/credits),
  "currency": "ARS" (for pesos) or "USD" (for dollars),
  "type": "purchase" | "payment" | "fee" | "credit" | "discount" | "tax",
  "installments": "XX/XX" (if present, e.g., "04/04") or null,
  "reference": "Transaction reference number if present"
}

NEGATIVE AMOUNT DETECTION RULES (CRITICAL):
For negative amounts, distinguish between actual credit card PAYMENTS vs promotional DISCOUNTS:

PAYMENT INDICATORS (type: "payment" - exclude from categorization):
- Description contains: "PAGO", "PAYMENT", "DEBITO", "DEBIT", "TRANSFERENCIA", "TRANSFER"
- Examples: "SU PAGO EN PESOS", "PAGO TARJETA DE CREDITO", "DEBITO AUTOMATICO"
- These represent actual payments TO the credit card and should NOT be categorized as expenses

DISCOUNT INDICATORS (type: "discount" - categorize with Descuentos category):
- Description contains: "DESCUENTO", "DISCOUNT", "PROMOCION", "PROMO", "REINTEGRO", "CASHBACK", "BONIFICACION", "REBATE"
- Examples: "DESCUENTO PROMOCIONAL", "REINTEGRO SUPERMERCADO", "CASHBACK BANCO"
- These represent promotional benefits/rebates and SHOULD be categorized as discounts

CREDIT INDICATORS (type: "credit" - categorize based on context):
- Any other negative amount that doesn't clearly fit payment or discount categories
- Will be categorized by the AI based on transaction context

DATE CONVERSION RULES:
Convert Spanish month abbreviations to ISO format:
- "04 mar. 26" → "2026-03-04"  
- "19 feb. 26" → "2026-02-19"
- "22 ene. 26" → "2026-01-22"

Spanish months: ene=01, feb=02, mar=03, abr=04, may=05, jun=06, jul=07, ago=08, sep=09, oct=10, nov=11, dic=12

AMOUNT PARSING RULES:
- "$ 521.348,70" → 521348.70
- "$ 60.748,70" → 60748.70  
- Remove $ symbol, remove . thousands separators, convert , to decimal point

TRANSACTION PARSING EXAMPLES:
- "01-11-25 002033 ROQUE NUBLO C.04/04 30.769,25" → 
  date: "2025-11-01", description: "ROQUE NUBLO", amount: 30769.25, installments: "04/04", type: "purchase"
- "04-02-26 SU PAGO EN PESOS 4.384,07-" → 
  date: "2026-02-04", description: "SU PAGO EN PESOS", amount: -4384.07, type: "payment"
- "19-02-26 IMP DE SELLOS P/INT.FIN. $25,26" →
  date: "2026-02-19", description: "IMP DE SELLOS P/INT.FIN.", amount: 25.26, type: "tax"
- "15-01-26 DESCUENTO PROMOCIONAL SUPER 500,00-" →
  date: "2026-01-15", description: "DESCUENTO PROMOCIONAL SUPER", amount: -500.00, type: "discount"
- "22-02-26 REINTEGRO BANCO PAMPA 1.200,50-" →
  date: "2026-02-22", description: "REINTEGRO BANCO PAMPA", amount: -1200.50, type: "discount"

Return only valid JSON without any markdown formatting or additional text.`;

/**
 * Generic credit card prompt (fallback)
 */
export const GENERIC_CREDIT_CARD_PROMPT = `You are an expert at extracting structured data from credit card statements.

Extract the following information from the credit card statement text and return it as a JSON object:

REQUIRED FIELDS:
- bank: Bank name
- cardType: Type of card (VISA, MasterCard, etc.)
- cardholderName: Cardholder's full name
- accountNumber: Account or card number
- statementDate: Statement date in YYYY-MM-DD format
- dueDate: Payment due date in YYYY-MM-DD format
- totalAmount: Total amount due
- minimumPayment: Minimum payment required
- transactions: Array of transaction objects

TRANSACTION OBJECT FORMAT:
{
  "date": "YYYY-MM-DD", 
  "description": "Transaction description",
  "amount": number,
  "type": "purchase" | "payment" | "fee"
}

Return only valid JSON without any markdown formatting.`;

/**
 * Get appropriate prompt based on detected bank
 */
export function getCreditCardPrompt(bank: string): string {
  switch (bank.toLowerCase()) {
    case 'galicia':
      return GALICIA_CREDIT_CARD_PROMPT;
    case 'pampa':
      return PAMPA_CREDIT_CARD_PROMPT;
    default:
      return GENERIC_CREDIT_CARD_PROMPT;
  }
}