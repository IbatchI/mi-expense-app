/**
 * Configuration Factory for Environment-Based Service Setup
 * 
 * Handles environment detection, configuration loading, and service instantiation
 * for both development (Express) and production (AWS Lambda) environments.
 */

import * as dotenv from 'dotenv';
import { DIContainer, SERVICE_TOKENS } from '../di/container';

// Configuration interfaces
export interface LLMConfig {
  provider: 'gemini' | 'github';
  apiKey: string;
  model?: string;
}

export interface StorageConfig {
  type: 'memory' | 's3';
  bucketName?: string;
  region?: string;
}

export interface CORSConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowCredentials: boolean;
}

export interface ServerConfig {
  port: number;
  host: string;
  maxFileSize: number; // in bytes
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'pretty' | 'json';
  enableConsole: boolean;
}

export interface AppConfig {
  environment: 'development' | 'production' | 'test';
  isLambda: boolean;
  llm: LLMConfig;
  storage: StorageConfig;
  cors: CORSConfig;
  server: ServerConfig;
  logging: LoggingConfig;
}

/**
 * Environment Detection
 */
export class EnvironmentDetector {
  static isLambdaEnvironment(): boolean {
    return !!(
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV ||
      process.env._LAMBDA_SERVER_PORT ||
      process.env.LAMBDA_RUNTIME_DIR
    );
  }

  static getEnvironmentType(): 'development' | 'production' | 'test' {
    const nodeEnv = process.env.NODE_ENV?.toLowerCase();
    
    if (nodeEnv === 'test') return 'test';
    if (nodeEnv === 'production') return 'production';
    
    return 'development';
  }

  static isLocalDevelopment(): boolean {
    return !this.isLambdaEnvironment() && this.getEnvironmentType() === 'development';
  }
}

/**
 * Configuration Builder
 */
export class ConfigurationBuilder {
  constructor() {
    // Load environment variables
    if (!EnvironmentDetector.isLambdaEnvironment()) {
      dotenv.config();
    }
  }

  build(): AppConfig {
    const environment = EnvironmentDetector.getEnvironmentType();
    const isLambda = EnvironmentDetector.isLambdaEnvironment();

    return {
      environment,
      isLambda,
      llm: this.buildLLMConfig(),
      storage: this.buildStorageConfig(isLambda),
      cors: this.buildCORSConfig(),
      server: this.buildServerConfig(),
      logging: this.buildLoggingConfig(isLambda)
    };
  }

  private buildLLMConfig(): LLMConfig {
    const provider = (process.env.LLM_PROVIDER?.toLowerCase() as 'gemini' | 'github') || 'gemini';
    
    let apiKey: string;
    if (provider === 'gemini') {
      apiKey = process.env.GEMINI_API_KEY || '';
    } else {
      apiKey = process.env.GITHUB_API_KEY || '';
    }

    if (!apiKey) {
      throw new Error(`Missing API key for LLM provider: ${provider}`);
    }

    const result: LLMConfig = {
      provider,
      apiKey
    };

    if (process.env.LLM_MODEL) {
      result.model = process.env.LLM_MODEL;
    }

    return result;
  }

  private buildStorageConfig(isLambda: boolean): StorageConfig {
    if (isLambda) {
      return {
        type: 's3',
        bucketName: process.env.S3_BUCKET_NAME || 'mi-expense-app-storage',
        region: process.env.AWS_REGION || 'us-east-1'
      };
    } else {
      return {
        type: 'memory'
      };
    }
  }

  private buildCORSConfig(): CORSConfig {
    const defaultOrigins = EnvironmentDetector.getEnvironmentType() === 'development' 
      ? ['http://localhost:3000', 'http://localhost:3001']
      : [];

    const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',')
      : defaultOrigins;

    return {
      allowedOrigins,
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowCredentials: EnvironmentDetector.getEnvironmentType() === 'development'
    };
  }

  private buildServerConfig(): ServerConfig {
    return {
      port: parseInt(process.env.PORT || '3001', 10),
      host: process.env.HOST || '0.0.0.0',
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '1048576', 10) // 1MB default
    };
  }

  private buildLoggingConfig(isLambda: boolean): LoggingConfig {
    const environment = EnvironmentDetector.getEnvironmentType();
    return {
      level: (process.env.LOG_LEVEL as any) || (environment === 'development' ? 'debug' : 'info'),
      format: isLambda ? 'json' : 'pretty',
      enableConsole: true
    };
  }
}

/**
 * Service Factory for creating environment-specific services
 */
export class ServiceFactory {
  static createLogger(config: LoggingConfig) {
    return {
      debug: (message: string, ...args: any[]) => {
        if (this.shouldLog('debug', config.level)) {
          console.log(this.formatMessage('DEBUG', message, config.format), ...args);
        }
      },
      info: (message: string, ...args: any[]) => {
        if (this.shouldLog('info', config.level)) {
          console.log(this.formatMessage('INFO', message, config.format), ...args);
        }
      },
      warn: (message: string, ...args: any[]) => {
        if (this.shouldLog('warn', config.level)) {
          console.warn(this.formatMessage('WARN', message, config.format), ...args);
        }
      },
      error: (message: string, ...args: any[]) => {
        if (this.shouldLog('error', config.level)) {
          console.error(this.formatMessage('ERROR', message, config.format), ...args);
        }
      }
    };
  }

  private static shouldLog(messageLevel: string, configLevel: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(messageLevel) >= levels.indexOf(configLevel);
  }

  private static formatMessage(level: string, message: string, format: string): string {
    const timestamp = new Date().toISOString();
    
    if (format === 'json') {
      return JSON.stringify({
        timestamp,
        level,
        message
      });
    } else {
      return `[${timestamp}] ${level}: ${message}`;
    }
  }

  static createStorage(config: StorageConfig) {
    if (config.type === 's3') {
      return {
        async store(_key: string, _data: any): Promise<string> {
          // TODO: Implement S3 storage
          throw new Error('S3 storage not yet implemented');
        },
        async retrieve(_key: string): Promise<any> {
          // TODO: Implement S3 retrieval
          throw new Error('S3 storage not yet implemented');
        }
      };
    } else {
      // Memory storage for development
      const memoryStore = new Map<string, any>();
      return {
        async store(key: string, data: any): Promise<string> {
          memoryStore.set(key, data);
          return key;
        },
        async retrieve(key: string): Promise<any> {
          return memoryStore.get(key);
        }
      };
    }
  }
}

/**
 * Main Configuration Factory
 */
export class ConfigurationFactory {
  static createConfiguration(): AppConfig {
    return new ConfigurationBuilder().build();
  }

  static registerServices(container: DIContainer, config: AppConfig): void {
    // Register configuration
    container.registerInstance(SERVICE_TOKENS.CONFIG.name, config);
    container.registerInstance(SERVICE_TOKENS.ENVIRONMENT.name, config.environment);

    // Register logger
    const logger = ServiceFactory.createLogger(config.logging);
    container.registerInstance(SERVICE_TOKENS.LOGGER.name, logger);

    // Register storage
    const storage = ServiceFactory.createStorage(config.storage);
    container.registerInstance('STORAGE', storage);

    // Log configuration
    logger.info('Services registered successfully', {
      environment: config.environment,
      isLambda: config.isLambda,
      llmProvider: config.llm.provider,
      storageType: config.storage.type
    });
  }

  static bootstrap(): { container: DIContainer; config: AppConfig } {
    const config = this.createConfiguration();
    const container = new DIContainer();
    
    this.registerServices(container, config);
    
    return { container, config };
  }
}

/**
 * Helper functions for environment-specific behavior
 */
export const EnvHelpers = {
  isDevelopment: () => EnvironmentDetector.getEnvironmentType() === 'development',
  isProduction: () => EnvironmentDetector.getEnvironmentType() === 'production',
  isTest: () => EnvironmentDetector.getEnvironmentType() === 'test',
  isLambda: () => EnvironmentDetector.isLambdaEnvironment(),
  isLocal: () => EnvironmentDetector.isLocalDevelopment(),

  requireEnvVar: (name: string): string => {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Required environment variable missing: ${name}`);
    }
    return value;
  },

  getEnvVar: (name: string, defaultValue: string = ''): string => {
    return process.env[name] || defaultValue;
  }
};