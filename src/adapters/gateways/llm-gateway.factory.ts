/**
 * LLM Gateway Factory
 * 
 * Creates LLM gateways dynamically based on the extractor configuration
 * provided in each request. This allows switching providers per-request
 * without restarting the server.
 */

import { LLMExtractionGateway } from './llm-extraction.gateway';
import { LLMConfig } from '../../use-cases/gateways/interfaces';

export class LLMGatewayFactory {
  /**
   * Creates a new LLM gateway instance with the specified configuration
   */
  static createGateway(config: LLMConfig): LLMExtractionGateway {
    // Validate configuration
    if (!config.provider) {
      throw new Error('LLM provider is required');
    }

    if (!['gemini', 'github'].includes(config.provider)) {
      throw new Error(`Unsupported LLM provider: ${config.provider}. Must be 'gemini' or 'github'`);
    }

    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new Error(`API key is required for ${config.provider} provider`);
    }

    // Create and return gateway with the specified config
    return new LLMExtractionGateway(config);
  }

  /**
   * Creates a gateway from extractor config (as sent in API requests)
   */
  static createFromExtractorConfig(extractorConfig: {
    provider: 'gemini' | 'github';
    apiKey: string;
    model?: string;
  }): LLMExtractionGateway {
    const llmConfig: LLMConfig = {
      provider: extractorConfig.provider,
      apiKey: extractorConfig.apiKey,
      ...(extractorConfig.model && { model: extractorConfig.model })
    };

    return this.createGateway(llmConfig);
  }
}
