import fetch from 'node-fetch';
import { BaseExtractor } from './base.extractor';
import { CreditCardStatement, ExtractorConfig } from '../types/credit-card.types';

/**
 * GitHub Models-based PDF data extractor
 */
export class GitHubExtractor extends BaseExtractor {
  private apiToken: string;
  private modelName: string;
  private baseUrl: string = 'https://models.inference.ai.azure.com';

  constructor(config: ExtractorConfig) {
    super(config);
    
    if (!config.apiKey) {
      throw new Error('GitHub token is required');
    }

    this.apiToken = config.apiKey;
    this.modelName = config.model || 'gpt-4o';
  }

  /**
   * Extract data using GitHub Models
   */
  protected async extractData(prompt: string): Promise<CreditCardStatement> {
    try {
      console.log(`🤖 Using GitHub Models: ${this.modelName}`);
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          model: this.modelName,
          temperature: 0,
          max_tokens: 8192,
          top_p: 1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub Models API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as any;
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response choices returned from GitHub Models');
      }

      const content = data.choices[0].message.content;
      
      if (!content || content.trim().length === 0) {
        throw new Error('Empty response from GitHub Models');
      }

      console.log('✅ Received response from GitHub Models');
      
      // Parse and validate JSON response
      const extractedData = this.cleanJsonResponse(content);
      
      // Log extraction statistics
      this.logStats(extractedData);
      
      return extractedData;

    } catch (error) {
      if (error instanceof Error) {
        // Handle specific GitHub Models errors
        if (error.message.includes('401')) {
          throw new Error('Invalid GitHub token. Get one at: https://github.com/settings/tokens');
        }
        if (error.message.includes('403')) {
          throw new Error('GitHub Copilot Pro subscription required for GitHub Models access');
        }
        if (error.message.includes('429')) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        if (error.message.includes('404')) {
          throw new Error(`GitHub model '${this.modelName}' not found. Try 'gpt-4o' or 'gpt-4o-mini'.`);
        }
      }
      
      throw new Error(`GitHub Models extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Test connection to GitHub Models API
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log(`   🔍 Testing connection to: ${this.baseUrl}/chat/completions`);
      console.log(`   🔑 Using model: ${this.modelName}`);
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: 'Hello, respond with "OK"'
            }
          ],
          model: this.modelName,
          max_tokens: 10,
        }),
      });

      console.log(`   📡 Response status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json() as any;
        console.log(`   ✅ Response data received`);
        return data.choices && data.choices[0]?.message?.content?.includes('OK');
      } else {
        const errorText = await response.text();
        console.error(`   ❌ API Error: ${response.status} - ${errorText}`);
        return false;
      }
      
    } catch (error) {
      console.error('   💥 GitHub Models connection test failed:', error);
      return false;
    }
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return [
      'gpt-4o',              // Latest GPT-4 Omni
      'gpt-4o-mini',         // Smaller, faster version
      'gpt-4',               // GPT-4 Turbo
      'gpt-3.5-turbo',       // Legacy but fast
    ];
  }

  /**
   * Get model pricing info
   */
  getModelInfo(model: string): { inputTokens: number; outputTokens: number } {
    const pricing = {
      'gpt-4o': { inputTokens: 0.0025, outputTokens: 0.01 },
      'gpt-4o-mini': { inputTokens: 0.00015, outputTokens: 0.0006 },
      'gpt-4': { inputTokens: 0.01, outputTokens: 0.03 },
      'gpt-3.5-turbo': { inputTokens: 0.0005, outputTokens: 0.0015 },
    };
    
    return (pricing as any)[model] || { inputTokens: 0, outputTokens: 0 };
  }
}