/**
 * Health Check Utilities
 * 
 * Additional utilities and configurations for monitoring and health checks.
 * Extends the HealthController with specific health check configurations.
 */

export interface ServiceHealthCheck {
  name: string;
  check: () => Promise<boolean>;
  timeout?: number;
  critical?: boolean;
}

export interface SystemHealthMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
    threshold: {
      warning: number;
      critical: number;
    };
  };
  uptime: number;
  environment: string;
  version: string;
  nodeVersion: string;
  platform: string;
}

export class HealthCheckRegistry {
  private static checks: Map<string, ServiceHealthCheck> = new Map();

  /**
   * Register a health check
   */
  static register(check: ServiceHealthCheck): void {
    this.checks.set(check.name, check);
  }

  /**
   * Get all registered health checks
   */
  static getChecks(): ServiceHealthCheck[] {
    return Array.from(this.checks.values());
  }

  /**
   * Run all health checks
   */
  static async runAllChecks(): Promise<{ [checkName: string]: { status: 'pass' | 'fail'; duration: number; error?: string } }> {
    const results: { [checkName: string]: { status: 'pass' | 'fail'; duration: number; error?: string } } = {};
    
    for (const [name, check] of this.checks) {
      const startTime = Date.now();
      
      try {
        const timeoutMs = check.timeout || 5000;
        const checkPromise = check.check();
        const timeoutPromise = new Promise<boolean>((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), timeoutMs);
        });

        const passed = await Promise.race([checkPromise, timeoutPromise]);
        
        results[name] = {
          status: passed ? 'pass' : 'fail',
          duration: Date.now() - startTime
        };
      } catch (error) {
        results[name] = {
          status: 'fail',
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    return results;
  }

  /**
   * Clear all registered checks
   */
  static clear(): void {
    this.checks.clear();
  }
}

/**
 * Built-in health checks
 */
export const builtInHealthChecks = {
  /**
   * Memory usage check
   */
  memory: (_warningThreshold: number = 80, criticalThreshold: number = 90): ServiceHealthCheck => ({
    name: 'memory',
    critical: true,
    check: async () => {
      const memUsage = process.memoryUsage();
      const percentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      return percentage < criticalThreshold;
    }
  }),

  /**
   * Environment variables check
   */
  environmentVariables: (requiredVars: string[]): ServiceHealthCheck => ({
    name: 'environment',
    critical: true,
    check: async () => {
      return requiredVars.every(envVar => process.env[envVar]);
    }
  }),

  /**
   * File system check (for temp directory access)
   */
  fileSystem: (): ServiceHealthCheck => ({
    name: 'filesystem',
    critical: false,
    check: async () => {
      try {
        const fs = require('fs').promises;
        const testFile = `/tmp/health-check-${Date.now()}.tmp`;
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        return true;
      } catch {
        return false;
      }
    }
  }),

  /**
   * LLM provider connectivity check
   */
  llmConnectivity: (
    testFunction: () => Promise<boolean>
  ): ServiceHealthCheck => ({
    name: 'llm-connectivity',
    critical: false,
    timeout: 10000,
    check: testFunction
  })
};

/**
 * Get system health metrics
 */
export function getSystemHealthMetrics(): SystemHealthMetrics {
  const memUsage = process.memoryUsage();
  
  return {
    memory: {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      threshold: {
        warning: 80,
        critical: 90
      }
    },
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    nodeVersion: process.version,
    platform: process.platform
  };
}

/**
 * Health check response formatter
 */
export class HealthCheckFormatter {
  /**
   * Format health check for load balancer
   */
  static forLoadBalancer(isHealthy: boolean): { status: string } {
    return {
      status: isHealthy ? 'UP' : 'DOWN'
    };
  }

  /**
   * Format detailed health check
   */
  static forMonitoring(
    overallStatus: 'healthy' | 'degraded' | 'unhealthy',
    checks: { [checkName: string]: any },
    metrics?: SystemHealthMetrics
  ): any {
    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
      ...(metrics && { system: metrics })
    };
  }

  /**
   * Format for Kubernetes readiness probe
   */
  static forKubernetesReadiness(isReady: boolean): { ready: boolean } {
    return {
      ready: isReady
    };
  }

  /**
   * Format for Kubernetes liveness probe
   */
  static forKubernetesLiveness(isLive: boolean): { alive: boolean } {
    return {
      alive: isLive
    };
  }
}

/**
 * Initialize default health checks
 */
export function initializeDefaultHealthChecks(): void {
  // Register basic health checks
  HealthCheckRegistry.register(
    builtInHealthChecks.memory(80, 90)
  );

  HealthCheckRegistry.register(
    builtInHealthChecks.environmentVariables([
      'GEMINI_API_KEY',
      'GITHUB_MODELS_API_KEY'
    ])
  );

  HealthCheckRegistry.register(
    builtInHealthChecks.fileSystem()
  );
}