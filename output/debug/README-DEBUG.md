# 🔍 PDF Debug Mode - Manual de Uso

Este directorio contiene los archivos de debug generados cuando se activa el modo de debug para el procesamiento de PDFs.

## ⚙️ Activación del Debug

Para activar el modo debug, configura la variable de entorno antes de procesar tu PDF:

```bash
export DEBUG_PDF_RAW=true
```

## 📊 Archivos Generados

Cuando proceses un PDF con el debug activado, se generarán 3 archivos con timestamp:

### 1. `raw-pdf-text-[timestamp].txt`
- **Contenido**: Texto exacto extraído por pdf-parse (sin modificaciones)
- **Uso**: Análisis manual de caracteres problemáticos
- **Formato**: UTF-8, texto plano

### 2. `pdf-parse-debug-[timestamp].json`
- **Contenido**: Análisis completo del PDF y metadatos
- **Estructura**:
  ```json
  {
    "timestamp": "2026-02-27T16-47-23-456Z",
    "bufferSize": 55059,
    "textLength": 6774,
    "pageCount": 2,
    "version": "1.7",
    "info": { "Title": "...", "Producer": "..." },
    "analysis": {
      "hasControlChars": true,
      "controlCharCount": 15,
      "lineCount": 89,
      "firstChars": "Primeros 200 caracteres...",
      "lastChars": "Últimos 200 caracteres...",
      "encoding": "PDF format detected",
      "suspiciousPatterns": [
        "Control characters found: \\u0002(3x), \\u0001(5x)",
        "High whitespace ratio: 67%"
      ]
    }
  }
  ```

### 3. `buffer-hex-[timestamp].txt`
- **Contenido**: Dump hexadecimal del buffer del PDF (primeros 2KB)
- **Uso**: Análisis de encoding a nivel byte
- **Incluye**: Header del PDF y análisis básico

## 🎯 Objetivo del Debug

Este modo te permite:

1. **Ver el texto crudo** exacto que devuelve pdf-parse
2. **Identificar caracteres de control** que causan problemas
3. **Analizar patrones sospechosos** en el contenido
4. **Comparar PDFs exitosos vs fallidos**
5. **Diagnosticar problemas de encoding**

## 🚀 Proceso Recomendado

1. Activa el debug: `export DEBUG_PDF_RAW=true`
2. Procesa tu PDF problemático
3. Revisa los archivos generados en este directorio
4. Compártelos para análisis más detallado
5. Compara con PDFs que funcionan correctamente

## 📝 Logs en Consola

Cuando el debug está activo, verás logs como:

```
🔍 DEBUG: Raw PDF data dumped to /path/to/output/debug
   📄 Raw text: raw-pdf-text-2026-02-27T16-47-23-456Z.txt
   📊 Debug data: pdf-parse-debug-2026-02-27T16-47-23-456Z.json  
   🔢 Hex dump: buffer-hex-2026-02-27T16-47-23-456Z.txt
   📝 Text length: 6774 chars, 2 pages
   ⚠️  Control chars: 15
```

## ⚠️ Notas Importantes

- El debug NO afecta el procesamiento normal del PDF
- Los archivos se generan ANTES de cualquier preprocesamiento
- El modo debug agrega ~50ms al tiempo de procesamiento
- Los archivos contienen el contenido exacto del PDF (pueden contener datos sensibles)

## 🔧 Desactivación

Para desactivar el debug:

```bash
unset DEBUG_PDF_RAW
# o
export DEBUG_PDF_RAW=false
```