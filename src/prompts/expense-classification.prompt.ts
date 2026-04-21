/**
 * Expense Classification Prompt
 * Categorizes Argentine credit card transactions into predefined Spanish categories.
 */

export function getClassificationPrompt(transactionList: string): string {
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
