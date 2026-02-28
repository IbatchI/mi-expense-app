/**
 * PDF Processor Gateway Implementation
 * 
 * Wraps the pdf-parse library in the gateway interface for PDF text extraction
 */

import { IPDFProcessorGateway, GatewayResult, PDFParseResult } from '../../use-cases/gateways/interfaces';
import * as fs from 'fs';
import * as path from 'path';

export class PDFProcessorGateway implements IPDFProcessorGateway {
  async parseFile(filePath: string): Promise<GatewayResult<PDFParseResult>> {
    const startTime = Date.now();

    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `PDF file not found: ${filePath}`,
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      // Read file buffer
      const pdfBuffer = fs.readFileSync(filePath);
      return await this.parseBuffer(pdfBuffer);

    } catch (error) {
      return {
        success: false,
        error: `Failed to read PDF file: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime: Date.now() - startTime }
      };
    }
  }

  async parseBuffer(buffer: Buffer): Promise<GatewayResult<PDFParseResult>> {
    const startTime = Date.now();

    try {
      // Validate buffer
      if (!buffer || buffer.length === 0) {
        return {
          success: false,
          error: 'PDF buffer is empty',
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      // Parse PDF using pdf-parse library
      const pdf = require('pdf-parse');
      const pdfData = await pdf(buffer);

      // 🔍 DEBUG: Dump raw PDF data if enabled
      if (true) {
        await this.dumpRawPDFData(pdfData, buffer);
      }

      const result: PDFParseResult = {
        text: pdfData.text,
        pageCount: pdfData.numpages,
        metadata: {
          title: pdfData.info?.Title,
          author: pdfData.info?.Author,
          creationDate: pdfData.info?.CreationDate,
          producer: pdfData.info?.Producer,
          version: pdfData.version
        }
      };

      return {
        success: true,
        data: result,
        metadata: {
          processingTime: Date.now() - startTime,
          bufferSize: buffer.length,
          pageCount: pdfData.numpages,
          textLength: pdfData.text.length
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `PDF parsing failed: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime: Date.now() - startTime }
      };
    }
  }

  async extractMetadata(filePath: string): Promise<GatewayResult<any>> {
    const startTime = Date.now();

    try {
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `PDF file not found: ${filePath}`,
          metadata: { processingTime: Date.now() - startTime }
        };
      }

      const pdfBuffer = fs.readFileSync(filePath);
      const pdf = require('pdf-parse');
      const pdfData = await pdf(pdfBuffer);

      return {
        success: true,
        data: {
          info: pdfData.info,
          metadata: pdfData.metadata,
          version: pdfData.version,
          pageCount: pdfData.numpages,
          fileSize: pdfBuffer.length
        },
        metadata: { processingTime: Date.now() - startTime }
      };

    } catch (error) {
      return {
        success: false,
        error: `Metadata extraction failed: ${error instanceof Error ? error.message : error}`,
        metadata: { processingTime: Date.now() - startTime }
      };
    }
  }

  /**
   * 🔍 DEBUG: Dump raw PDF data for analysis
   */
  private async dumpRawPDFData(pdfData: any, buffer: Buffer): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputDir = path.join(process.cwd(), 'output', 'debug');
      
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 1. RAW TEXT FILE - Exact content from pdf-parse
      const rawTextFile = path.join(outputDir, `raw-pdf-text-${timestamp}.txt`);
      fs.writeFileSync(rawTextFile, pdfData.text, 'utf8');

      // 2. DEBUG JSON FILE - Complete analysis
      const debugDataFile = path.join(outputDir, `pdf-parse-debug-${timestamp}.json`);
      const debugData = {
        timestamp,
        bufferSize: buffer.length,
        textLength: pdfData.text.length,
        pageCount: pdfData.numpages,
        version: pdfData.version,
        info: pdfData.info,
        metadata: pdfData.metadata,
        analysis: {
          hasControlChars: /[\x00-\x1F\x7F-\x9F]/.test(pdfData.text),
          controlCharCount: (pdfData.text.match(/[\x00-\x1F\x7F-\x9F]/g) || []).length,
          lineCount: pdfData.text.split('\n').length,
          firstChars: pdfData.text.substring(0, 200),
          lastChars: pdfData.text.substring(Math.max(0, pdfData.text.length - 200)),
          encoding: this.detectEncoding(buffer),
          suspiciousPatterns: this.findSuspiciousPatterns(pdfData.text)
        }
      };
      
      fs.writeFileSync(debugDataFile, JSON.stringify(debugData, null, 2), 'utf8');

      // 3. HEX DUMP FILE - Buffer analysis (first 2KB)
      const hexFile = path.join(outputDir, `buffer-hex-${timestamp}.txt`);
      const hexContent = buffer.subarray(0, 2048).toString('hex').match(/.{2}/g)?.join(' ') || '';
      const hexAnalysis = `PDF Buffer Analysis
===================
Buffer length: ${buffer.length} bytes
First 2KB in hex format:

${hexContent}

PDF Header: ${buffer.subarray(0, 16).toString('ascii', 0, 16)}
`;
      fs.writeFileSync(hexFile, hexAnalysis, 'utf8');

      console.log(`🔍 DEBUG: Raw PDF data dumped to ${outputDir}`);
      console.log(`   📄 Raw text: ${path.basename(rawTextFile)}`);
      console.log(`   📊 Debug data: ${path.basename(debugDataFile)}`);  
      console.log(`   🔢 Hex dump: ${path.basename(hexFile)}`);
      console.log(`   📝 Text length: ${pdfData.text.length} chars, ${pdfData.numpages} pages`);
      console.log(`   ⚠️  Control chars: ${(pdfData.text.match(/[\x00-\x1F\x7F-\x9F]/g) || []).length}`);

    } catch (error) {
      console.error('❌ Failed to dump PDF debug data:', error);
    }
  }

  /**
   * Detect likely encoding of the PDF buffer
   */
  private detectEncoding(buffer: Buffer): string {
    // Basic encoding detection heuristics
    const header = buffer.subarray(0, 100).toString('ascii');
    
    if (header.includes('%PDF')) {
      return 'PDF format detected';
    }
    
    // Check for common encoding markers
    const sample = buffer.subarray(0, 1000);
    const nullBytes = sample.filter(byte => byte === 0).length;
    const highBytes = sample.filter(byte => byte > 127).length;
    
    if (nullBytes > sample.length * 0.1) {
      return 'binary/null-heavy';
    } else if (highBytes > sample.length * 0.1) {
      return 'non-ascii/extended';
    } else {
      return 'ascii-compatible';
    }
  }

  /**
   * Find suspicious patterns in the text
   */
  private findSuspiciousPatterns(text: string): string[] {
    const patterns: string[] = [];
    
    // Check for excessive null/control characters
    const controlChars = text.match(/[\x00-\x1F\x7F-\x9F]/g) || [];
    if (controlChars.length > 0) {
      const charCounts: { [key: string]: number } = {};
      controlChars.forEach(char => {
        const code = char.charCodeAt(0);
        const key = `\\u${code.toString(16).padStart(4, '0')}`;
        charCounts[key] = (charCounts[key] || 0) + 1;
      });
      
      patterns.push(`Control characters found: ${Object.entries(charCounts).map(([k, v]) => `${k}(${v}x)`).join(', ')}`);
    }
    
    // Check for excessive whitespace
    const whitespaceRatio = (text.match(/\s/g) || []).length / text.length;
    if (whitespaceRatio > 0.5) {
      patterns.push(`High whitespace ratio: ${Math.round(whitespaceRatio * 100)}%`);
    }
    
    // Check for repeated patterns
    if (/(.{3,})\1{3,}/.test(text)) {
      patterns.push('Repeated patterns detected (possible corruption)');
    }
    
    return patterns;
  }
}