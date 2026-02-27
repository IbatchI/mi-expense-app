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
  "type": "purchase" | "payment" | "fee" | "tax"
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
      // TODO: Create specific prompt for Banco Pampa
      return GENERIC_CREDIT_CARD_PROMPT;
    default:
      return GENERIC_CREDIT_CARD_PROMPT;
  }
}