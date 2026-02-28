/**
 * Health Controller
 * 
 * Provides health check endpoints for monitoring and status verification.
 * Tests system components, external dependencies, and service availability.
 */

import { ILLMConnectionTestUseCase } from '../../use-cases/interfaces';

// Define minimal request/response interfaces to avoid Express dependency issues for now
export interface HttpRequest {
  body: any;
  params: { [key: string]: string };
  query: { [key: string]: string | string[] };
}

export interface HttpResponse {
  status(code: number): HttpResponse;
  json(data: any): void;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    [componentName: string]: {
      status: 'pass' | 'warn' | 'fail';
      details?: string;
      duration?: number;
      lastChecked: string;
    };
  };
}

export interface DetailedHealthCheck extends HealthCheckResult {
  system: {
    memory: {
      used: number;
      total: number;
      percentage: number;
      formatted: {
        used: string;
        total: string;
      };
    };
    cpu: {
      usage: number;
    };
    platform: string;
    nodeVersion: string;
  };
  dependencies: {
    [serviceName: string]: {
      status: 'connected' | 'disconnected' | 'error';
      responseTime?: number;
      error?: string;
    };
  };
}

export class HealthController {
  private startTime: Date;
  
  constructor(
    private llmConnectionTestUseCase?: ILLMConnectionTestUseCase
  ) {
    this.startTime = new Date();
  }

  /**
   * Basic health check endpoint
   * Returns simple status for load balancers and monitoring
   */
  async getHealth(_req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const healthResult = await this.performBasicHealthCheck();
      
      if (healthResult.status === 'healthy') {
        res.status(200).json(healthResult);
      } else if (healthResult.status === 'degraded') {
        res.status(200).json(healthResult); // Still return 200 for degraded
      } else {
        res.status(503).json(healthResult);
      }
    } catch (error) {
      console.error('Health check error:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Detailed health check with system metrics and dependency status
   */
  async getDetailedHealth(_req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const detailedHealth = await this.performDetailedHealthCheck();
      
      if (detailedHealth.status === 'healthy') {
        res.status(200).json(detailedHealth);
      } else if (detailedHealth.status === 'degraded') {
        res.status(200).json(detailedHealth);
      } else {
        res.status(503).json(detailedHealth);
      }
    } catch (error) {
      console.error('Detailed health check error:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: 'Detailed health check failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Test LLM connection endpoint
   */
  async testLLMConnection(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const { provider, apiKey, model } = req.body;

      if (!provider || !apiKey) {
        res.status(400).json({
          success: false,
          error: 'Provider and apiKey are required',
          validProviders: ['gemini', 'github']
        });
        return;
      }

      if (!['gemini', 'github'].includes(provider)) {
        res.status(400).json({
          success: false,
          error: 'Invalid provider',
          validProviders: ['gemini', 'github']
        });
        return;
      }

      if (!this.llmConnectionTestUseCase) {
        res.status(503).json({
          success: false,
          error: 'LLM connection testing not available'
        });
        return;
      }

      const startTime = Date.now();
      const isConnected = await this.llmConnectionTestUseCase.testConnection({
        provider,
        apiKey,
        model
      });
      const duration = Date.now() - startTime;

      res.status(200).json({
        success: isConnected,
        provider,
        model: model || 'default',
        responseTime: duration,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('LLM connection test error:', error);
      res.status(500).json({
        success: false,
        error: 'LLM connection test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get application status and metrics
   */
  async getStatus(_req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
      
      res.status(200).json({
        application: 'Mi Expense App',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: {
          seconds: uptime,
          human: this.formatUptime(uptime)
        },
        startTime: this.startTime.toISOString(),
        currentTime: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        pid: process.pid
      });
    } catch (error) {
      console.error('Status check error:', error);
      res.status(500).json({
        error: 'Failed to get status',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Perform basic health check
   */
  private async performBasicHealthCheck(): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();
    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    
    const checks: HealthCheckResult['checks'] = {};
    
    // Memory check
    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    checks.memory = {
      status: memoryUsagePercent < 90 ? 'pass' : memoryUsagePercent < 95 ? 'warn' : 'fail',
      details: `${memoryUsagePercent.toFixed(1)}% used`,
      lastChecked: timestamp
    };
    
    // Environment variables check
    const requiredEnvVars = ['GEMINI_API_KEY', 'GITHUB_MODELS_API_KEY'];
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    checks.environment = {
      status: missingEnvVars.length === 0 ? 'pass' : missingEnvVars.length < requiredEnvVars.length ? 'warn' : 'fail',
      details: missingEnvVars.length > 0 ? `Missing: ${missingEnvVars.join(', ')}` : 'All required environment variables present',
      lastChecked: timestamp
    };

    // Determine overall status
    const hasFailures = Object.values(checks).some(check => check.status === 'fail');
    const hasWarnings = Object.values(checks).some(check => check.status === 'warn');
    
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (hasFailures) {
      overallStatus = 'unhealthy';
    } else if (hasWarnings) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    return {
      status: overallStatus,
      timestamp,
      uptime,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks
    };
  }

  /**
   * Perform detailed health check with system metrics
   */
  private async performDetailedHealthCheck(): Promise<DetailedHealthCheck> {
    const basicHealth = await this.performBasicHealthCheck();
    const memoryUsage = process.memoryUsage();
    
    const detailedHealth: DetailedHealthCheck = {
      ...basicHealth,
      system: {
        memory: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
          formatted: {
            used: this.formatBytes(memoryUsage.heapUsed),
            total: this.formatBytes(memoryUsage.heapTotal)
          }
        },
        cpu: {
          usage: 0 // CPU usage calculation would need additional monitoring
        },
        platform: process.platform,
        nodeVersion: process.version
      },
      dependencies: {}
    };

    // Test LLM connections if available
    if (this.llmConnectionTestUseCase) {
      // Test Gemini connection
      if (process.env.GEMINI_API_KEY) {
        try {
          const startTime = Date.now();
          const geminiConnected = await this.llmConnectionTestUseCase.testConnection({
            provider: 'gemini',
            apiKey: process.env.GEMINI_API_KEY
          });
          detailedHealth.dependencies.gemini = {
            status: geminiConnected ? 'connected' : 'disconnected',
            responseTime: Date.now() - startTime
          };
        } catch (error) {
          detailedHealth.dependencies.gemini = {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }

      // Test GitHub Models connection
      if (process.env.GITHUB_MODELS_API_KEY) {
        try {
          const startTime = Date.now();
          const githubConnected = await this.llmConnectionTestUseCase.testConnection({
            provider: 'github',
            apiKey: process.env.GITHUB_MODELS_API_KEY
          });
          detailedHealth.dependencies.github = {
            status: githubConnected ? 'connected' : 'disconnected',
            responseTime: Date.now() - startTime
          };
        } catch (error) {
          detailedHealth.dependencies.github = {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }
    }

    return detailedHealth;
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Format uptime to human readable string
   */
  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

    return parts.join(' ');
  }
}