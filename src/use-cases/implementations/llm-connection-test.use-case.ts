/**
 * LLM Connection Test Use Case Implementation
 * 
 * Tests connectivity and authentication with LLM providers before processing.
 * Provides early validation to avoid failed processing attempts.
 */

import { ILLMConnectionTestUseCase, StatementExtractionRequest } from '../interfaces';
import { ILoggingGateway } from '../gateways/interfaces';
import { LLMGatewayFactory } from '../../adapters/gateways/llm-gateway.factory';

export class LLMConnectionTestUseCase implements ILLMConnectionTestUseCase {
  constructor(
    private readonly logger: ILoggingGateway
  ) {}

  async testConnection(extractorConfig: StatementExtractionRequest['extractorConfig']): Promise<boolean> {
    try {
      this.logger.debug('Testing LLM connection', {
        provider: extractorConfig.provider,
        model: extractorConfig.model,
        hasApiKey: !!extractorConfig.apiKey
      });

      // Validate configuration first
      if (!extractorConfig.apiKey || extractorConfig.apiKey.trim().length === 0) {
        this.logger.error('LLM connection test failed: No API key provided');
        return false;
      }

      // Create a gateway instance for this specific request
      const gateway = LLMGatewayFactory.createFromExtractorConfig(extractorConfig);

      // Test connection with a simple prompt
      const testResult = await gateway.extractData({
        prompt: "Test connection. Respond with a simple JSON object containing 'status': 'ok'",
        text: "This is a test",
        format: 'json'
      });

      if (!testResult.success) {
        this.logger.error('LLM connection test failed', {
          provider: extractorConfig.provider,
          error: testResult.error
        });
        return false;
      }

      this.logger.info('LLM connection test successful', {
        provider: extractorConfig.provider,
        model: testResult.data?.modelUsed || extractorConfig.model,
        responseTime: testResult.metadata?.processingTime
      });

      return true;

    } catch (error) {
      this.logger.error('LLM connection test error', {
        provider: extractorConfig.provider,
        error: error instanceof Error ? error.message : error
      });
      return false;
    }
  }
}