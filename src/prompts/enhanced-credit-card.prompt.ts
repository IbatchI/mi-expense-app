/**
 * Enhanced Credit Card Prompt for Banco Galicia VISA Statements
 * Based on real PDF analysis and preprocessing results
 */

export const GALICIA_CREDIT_CARD_PROMPT = `You are an expert at extracting structured data from Banco Galicia VISA credit card statements.

You will receive PREPROCESSED text that has been cleaned and organized from a Banco Galicia VISA statement PDF. The text is already in a clean, structured format with clear sections.

Please extract the following information and return it as a JSON object:

REQUIRED FIELDS (these names must match exactly):
- statementNumber: Statement number (format: VI followed by numbers)
- cardType: Always "VISA" for these statements  
- bank: Always "Banco Galicia"
- holder: Full name of the cardholder (changed from cardholderName for consistency)
- accountNumber: Account number
- period: Object with these EXACT subfields:
  - previousClosing: Previous closing date in YYYY-MM-DD format
  - previousDueDate: Previous due date in YYYY-MM-DD format  
  - currentClosing: Current statement date in YYYY-MM-DD format
  - currentDueDate: Payment due date in YYYY-MM-DD format
- totals: Object with these EXACT subfields:
  - pesos: Total amount in Argentine Pesos
  - dollars: Total amount in US Dollars (if any, use 0 if none)
  - minimumPayment: Minimum payment required
- transactions: Array of transaction objects
- fees: Array of fees and taxes
- branch: Branch number
- address: Complete address
- previousBalance: Previous statement balance
- currentBalance: Current statement balance
- availableCredit: Available credit limit

TRANSACTION OBJECT FORMAT:
{
  "date": "YYYY-MM-DD",
  "merchant": "Merchant name (cleaned)",
  "amountPesos": number,
  "amountUSD": number,
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
1. Clean merchant names by removing asterisks (*) and normalizing format
2. Parse installment information (XX/YY format) into separate field  
3. Separate taxes/fees from regular purchases
4. Handle both ARS and USD currencies correctly
5. Extract all reference numbers accurately
6. Convert dates to ISO format (YYYY-MM-DD)
7. For ARS transactions, set amountPesos to the transaction amount and amountUSD to 0.00
8. For USD transactions, set amountUSD to the transaction amount and amountPesos to 0.00
9. Ensure ALL transactions have both merchant and amount fields populated

Return only valid JSON without any markdown formatting or additional text.

Example response structure:
{
  "statementNumber": "VI00000000062132419",
  "cardType": "VISA",
  "bank": "Banco Galicia",
  "holder": "LUCAS MATEO HERNANDEZ",
  "accountNumber": "1181500877", 
  "period": {
    "previousClosing": "2026-01-19",
    "previousDueDate": "2026-02-19", 
    "currentClosing": "2026-02-19",
    "currentDueDate": "2026-03-19"
  },
  "totals": {
    "pesos": 482149.89,
    "dollars": 0.01,
    "minimumPayment": 35590.00
  },
  "transactions": [
    {
      "date": "2025-11-17",
      "merchant": "Juleriaque.com.ar",
      "amountPesos": 25000.00,
      "amountUSD": 0.00,
      "installments": "04/06",
      "reference": "007897",
      "type": "purchase"
    }
  ],
  "fees": [
    {
      "date": "2026-02-19",
      "merchant": "IIBB Perception",
      "amountPesos": 32.10,
      "amountUSD": 0.00,
      "type": "tax"
    }
  ],
  "branch": "123",
  "address": "CALLE 30 1086, GENERAL PICO, L6360EGV",
  "previousBalance": 450000.00,
  "currentBalance": 482149.89,
  "availableCredit": 4017850.11
}`;

/**
 * Banco de la Pampa Credit Card Prompt
 * Covers both VISA and MasterCard formats from Banco de la Pampa
 */
export const PAMPA_CREDIT_CARD_PROMPT = `You are an expert at extracting structured data from Banco de la Pampa credit card statements (both VISA and MasterCard).

You will receive text from a Banco de la Pampa statement. Extract the following information and return it as a JSON object with these EXACT field names:

REQUIRED FIELDS (these names must match exactly):
- holder: Cardholder full name.
  VISA format: extract from "TITULAR DE CUENTA:" label (e.g., "HERNANDEZ LUCAS MATEO")
  MC format: extract from "TOTAL TITULAR" line (e.g., "TOTAL TITULAR  HERNANDEZ LUCAS MATEO" → "HERNANDEZ LUCAS MATEO")
- accountNumber: Account or card number.
  VISA format: extract from "N DE CUENTA:" (e.g., "1082141836")
  MC format: extract from "Nº de Socio:" (e.g., "139-0164237-0-3")
- bank: Always "Banco de la Pampa"
- cardType: "VISA" or "MASTERCARD" depending on what the statement shows
- period: Object with these EXACT subfields (all dates in YYYY-MM-DD format):
  - currentClosing: Current statement closing date.
    VISA: extract from "Cierre actual:" (e.g., "19 feb. 26" → "2026-02-19")
    MC: extract from "Estado de cuenta al:" (e.g., "19-Feb-26" → "2026-02-19")
  - currentDueDate: Current payment due date.
    VISA: extract from "Vencimiento actual:" (e.g., "04 mar. 26" → "2026-03-04")
    MC: extract from "Vencimiento actual:" (e.g., "05-Mar-26" → "2026-03-05")
  - previousClosing: Previous statement closing date.
    VISA: extract from "Cierre anterior:" (e.g., "22 ene. 26" → "2026-01-22")
    MC: extract from "Cierre Anterior:" (e.g., "22-Ene-26" → "2026-01-22")
  - previousDueDate: Previous payment due date.
    VISA: extract from "Vencimiento anterior:" (e.g., "04 feb. 26" → "2026-02-04")
    MC: extract from "Vencimiento Anterior:" (e.g., "05-Feb-26" → "2026-02-05")
- totals: Object with these EXACT subfields:
  - pesos: Total balance in Argentine Pesos (numeric).
    VISA: extract from "SALDO ACTUAL" line (e.g., "$ 521.348,70" → 521348.70)
    MC: extract from "Saldo actual:" (e.g., "$        313424,72" → 313424.72)
  - dollars: US Dollar balance (usually 0; extract if present, else use 0)
    MC: extract from "U$S" column next to "Saldo actual:" (e.g., "U$S         0,00" → 0.00)
  - minimumPayment: Minimum payment required (numeric).
    VISA: extract from "PAGO MINIMO" line (e.g., "$ 60.748,70" → 60748.70)
    MC: extract from "Pago Mínimo:" (e.g., "$         31340,00" → 31340.00)
- transactions: Array of transaction objects (see format below)

TRANSACTION OBJECT FORMAT:
{
  "date": "YYYY-MM-DD",
  "description": "Clean merchant or concept name (remove extra spaces, voucher numbers, and formatting)",
  "amount": number (positive for charges/purchases, negative for payments/credits/discounts),
  "currency": "ARS" or "USD",
  "type": "purchase" | "payment" | "fee" | "credit" | "discount" | "tax",
  "installments": "XX/XX" (if present, e.g., "02/04") or null,
  "reference": "Voucher or reference number if present, else null"
}

DATE CONVERSION RULES:
VISA uses Spanish abbreviations with spaces: "04 mar. 26" → "2026-03-04"
MC uses Spanish abbreviations with hyphens:  "05-Mar-26" → "2026-03-05"
Spanish months (both formats): ene/Ene=01, feb/Feb=02, mar/Mar=03, abr/Abr=04, may/May=05, jun/Jun=06,
                                jul/Jul=07, ago/Ago=08, sep/Sep=09, oct/Oct=10, nov/Nov=11, dic/Dic=12

AMOUNT PARSING RULES:
VISA uses period as thousands separator and comma as decimal: "$ 521.348,70" → 521348.70
MC uses no thousands separator and comma as decimal:          "313424,72"    → 313424.72
Remove $ symbol, U$S symbol, and whitespace before converting.

NEGATIVE AMOUNT DETECTION (CRITICAL):
Payments to the card (type: "payment" — do NOT categorize as expense):
  - Description contains: "PAGO", "SU PAGO", "PAYMENT", "DEBITO", "TRANSFERENCIA"
  - Examples: "SU PAGO EN PESOS", "PAGO TARJETA DE CREDITO"

Promotional discounts/rebates (type: "discount"):
  - Description contains: "DESCUENTO", "DISCOUNT", "PROMO", "PROMOCION", "REINTEGRO", "CASHBACK", "BONIFICACION", "BONIF."
  - Examples: "PROMO ALIMENTOS", "BONIF. CONSUMO EXPRESO ALBERINO SA", "REINTEGRO BANCO PAMPA"

Other credits (type: "credit"):
  - Any other negative amount not clearly a payment or discount

TRANSACTION PARSING EXAMPLES:

VISA format:
- "01-11-25 002033 ROQUE NUBLO  C.04/04 30.769,25" →
  date: "2025-11-01", description: "ROQUE NUBLO", amount: 30769.25, currency: "ARS", installments: "04/04", reference: "002033", type: "purchase"
- "04-02-26 SU PAGO EN PESOS 4.384,07-" →
  date: "2026-02-04", description: "SU PAGO EN PESOS", amount: -4384.07, currency: "ARS", type: "payment"
- "25-01-26 003862 BONIF. CONSUMO EXPRESO ALBERINO SA 15.070,00-" →
  date: "2026-01-25", description: "BONIF. CONSUMO EXPRESO ALBERINO SA", amount: -15070.00, currency: "ARS", type: "discount"
- "19-02-26 IMP DE SELLOS P/INT.FIN. $25,26" →
  date: "2026-02-19", description: "IMP DE SELLOS P/INT.FIN.", amount: 25.26, currency: "ARS", type: "tax"

MC format:
- "25-Ene-26 EXPRESO DUMAS SA 01731 122500,00" →
  date: "2026-01-25", description: "EXPRESO DUMAS SA", amount: 122500.00, currency: "ARS", reference: "01731", type: "purchase"
- "24-Dic-25 ROQUE NUBLO 02/04 00873 19597,00" →
  date: "2025-12-24", description: "ROQUE NUBLO", amount: 19597.00, currency: "ARS", installments: "02/04", reference: "00873", type: "purchase"
- "19-Feb-26 PROMO PASAJES 00000 -15000,00" →
  date: "2026-02-19", description: "PROMO PASAJES", amount: -15000.00, currency: "ARS", type: "discount"
- "05-Feb-26 SU PAGO -120936,17" →
  date: "2026-02-05", description: "SU PAGO", amount: -120936.17, currency: "ARS", type: "payment"

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