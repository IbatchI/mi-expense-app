/**
 * Tavily Web Search Gateway
 *
 * Implements IWebSearchGateway using the Tavily Search API.
 * Uses native fetch (Node >=18) + AbortController for timeout.
 * NEVER throws — always resolves (returns "" on any failure).
 */

import { IWebSearchGateway } from '../../../use-cases/gateways/interfaces';

interface TavilyResult {
  content: string;
}

interface TavilyResponse {
  results: TavilyResult[];
}

export class TavilyGateway implements IWebSearchGateway {
  private readonly apiKey: string;
  private readonly defaultTimeoutMs: number;

  constructor(apiKey: string, options?: { timeoutMs?: number }) {
    this.apiKey = apiKey;
    this.defaultTimeoutMs = options?.timeoutMs ?? 5000;
  }

  async search(query: string, options?: { timeoutMs?: number }): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          search_depth: 'basic',
          max_results: 3,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return '';
      }

      const data = (await response.json()) as TavilyResponse;
      const joined = (data.results ?? [])
        .map((r) => r.content)
        .filter(Boolean)
        .join(' | ');

      return joined.length >= 20 ? joined : '';
    } catch {
      return '';
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
