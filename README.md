# Mi Expense App - PDF Data Extractor

Extract structured data from credit card statements using LLMs (Gemini or GitHub Models).

## 🚀 Quick Start

### 1. Install Dependencies (Already Done ✅)

```bash
npm install
```

### 2. Configure API Keys

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your API key:

**Option A: Using Gemini (Recommended - Free)**

```env
PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
```

Get your Gemini API key: https://makersuite.google.com/app/apikey

**Option B: Using GitHub Models (Copilot Pro)**

```env
PROVIDER=github
GITHUB_TOKEN=your_github_token_here
```

Get your GitHub token: https://github.com/settings/tokens

### 3. Add Your PDF

Place your credit card statement PDF in the `pdfs/` folder and rename it to `statement.pdf`:

```bash
cp /path/to/your/Resumen_.pdf pdfs/statement.pdf
```

### 4. Run the Extractor

```bash
npm start
```

## 📁 Project Structure

```
mi-expense-app/
├── src/
│   ├── extractors/
│   │   ├── base.extractor.ts      # Base class for extractors
│   │   ├── gemini.extractor.ts    # Gemini implementation
│   │   └── github.extractor.ts    # GitHub Models implementation
│   ├── prompts/
│   │   └── credit-card.prompt.ts  # Extraction prompt template
│   ├── types/
│   │   └── credit-card.types.ts   # TypeScript interfaces
│   └── index.ts                    # Main entry point
├── pdfs/                           # Place your PDFs here
├── output/                         # Extracted JSON output
├── package.json
├── tsconfig.json
└── .env                            # Your API keys (not in git)
```

## 📊 Output

The extracted data is saved to `output/extracted-data.json` with this structure:

```json
{
  "holder": "LUCAS MATEO HERNANDEZ",
  "accountNumber": "1181500877",
  "bank": "Banco Galicia",
  "period": {
    "previousClosing": "2026-01-22",
    "previousDueDate": "2026-02-02",
    "currentClosing": "2026-02-19",
    "currentDueDate": "2026-03-02"
  },
  "totals": {
    "pesos": 482149.89,
    "dollars": -0.01,
    "minimumPayment": 35590.0
  },
  "transactions": [
    {
      "date": "2026-01-30",
      "merchant": "WWWVENTAWEBAPNGOBAR",
      "installment": null,
      "voucher": "009909",
      "amountPesos": 52500.0,
      "amountDollars": 0
    }
  ]
}
```

## 📝 Scripts

- `npm start` - Run the extractor with default settings
- `npm run dev:gemini` - Force use Gemini
- `npm run dev:github` - Force use GitHub Models
- `npm run build` - Compile TypeScript to JavaScript

## 🐛 Troubleshooting

### Error: "Missing API key"

- Check that your `.env` file exists
- Verify the API key is correct
- Make sure you selected the right `PROVIDER`

### Error: "PDF not found"

- Place your PDF in the `pdfs/` folder
- Rename it to `statement.pdf`
- Or modify `PDF_PATH` in your `.env` file

### Error: "Invalid JSON response"

- The PDF content might be too complex for the LLM
- Try a different model (set `MODEL` in `.env`)
- Check if the PDF has clear, readable text

## ⚙️ Configuration

You can customize the extractor by setting these environment variables in your `.env` file:

```env
# Required
PROVIDER=gemini                     # or 'github'
GEMINI_API_KEY=your_key_here       # if using Gemini
GITHUB_TOKEN=your_token_here       # if using GitHub

# Optional
MODEL=gemini-3-flash-review             # or 'gpt-4o', 'gpt-4o-mini', etc.
PDF_PATH=pdfs/statement.pdf        # Custom PDF path
OUTPUT_PATH=output/data.json       # Custom output path
```

## 🤖 Supported Models

### Gemini (Free)

- `gemini-3-flash-review` (default) - Fast and efficient
- `gemini-1.5-pro` - More capable but slower
- `gemini-1.0-pro` - Legacy model

### GitHub Models (Requires Copilot Pro)

- `gpt-4o` (default) - Latest GPT-4 Omni
- `gpt-4o-mini` - Smaller, faster version
- `gpt-4` - GPT-4 Turbo
- `gpt-3.5-turbo` - Legacy but fast

## 🔒 Security Notes

- Never commit your `.env` file to git
- Your API keys are stored locally only
- PDFs are processed locally before sending text to LLMs
- No sensitive data is permanently stored by the AI providers

## 📄 License

MIT License - Feel free to use this project however you want!

---

## Next Steps

1. **Copy `.env.example` to `.env`** and add your API key
2. **Add your PDF** to `pdfs/statement.pdf`
3. **Run `npm start`** to extract data
4. **Check `output/extracted-data.json`** for results

Happy extracting! 🎉
