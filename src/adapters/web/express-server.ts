/**
 * Express Server Setup
 * 
 * Configures Express server for development mode with middleware, CORS,
 * file upload handling, and route definitions.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { StatementController } from '../controllers/statement.controller';
import { HealthController } from '../controllers/health.controller';
import { ConfigurationFactory } from '../../infrastructure/config/configuration.factory';
import { bootstrapUseCases } from '../../use-cases/setup/dependency-injection.setup';
import { DIContainer } from '../../infrastructure/di/container';

// Error handling interface
interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  type?: string; // Add type property for specific error handling
}

// Server configuration interface
export interface ServerConfig {
  port: number;
  corsOrigins: string[];
  maxFileSize: number; // in bytes
  environment: 'development' | 'production' | 'test';
}

// Default server configuration
const defaultConfig: ServerConfig = {
  port: 3001,
  corsOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  maxFileSize: 1024 * 1024, // 1MB
  environment: (process.env.NODE_ENV as ServerConfig['environment']) || 'development'
};

export class ExpressServer {
  private app: Express;
  private config: ServerConfig;
  private statementController: StatementController;
  private healthController: HealthController;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.app = express();
    
    // Initialize controllers with dependency injection
    const appConfig = ConfigurationFactory.createConfiguration();
    const container = new DIContainer();
    const useCaseFactory = bootstrapUseCases(container, appConfig);
    
    this.statementController = new StatementController(
      useCaseFactory.getCompleteFileProcessingUseCase()
    );
    this.healthController = new HealthController(
      useCaseFactory.getLLMConnectionTestUseCase()
    );

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Security headers
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });

    // CORS configuration
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true,
      optionsSuccessStatus: 200,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: '2mb' // Slightly higher than max file size to account for base64 encoding
    }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging middleware (development only)
    if (this.config.environment === 'development') {
      this.app.use((req: Request, _res: Response, next: NextFunction) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
      next();
      return; // Add explicit return
      });
    }

    // Request timeout middleware
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      // Set timeout to 5 minutes for file processing
      req.setTimeout(300000, () => {
        const error = new Error('Request timeout') as AppError;
        error.statusCode = 408;
        next(error);
      });
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // API version prefix
    const apiRouter = express.Router();
    this.app.use('/api/v1', apiRouter);

    // Health check routes
    apiRouter.get('/health', this.wrapAsync(this.healthController.getHealth.bind(this.healthController)));
    apiRouter.get('/health/detailed', this.wrapAsync(this.healthController.getDetailedHealth.bind(this.healthController)));
    apiRouter.get('/status', this.wrapAsync(this.healthController.getStatus.bind(this.healthController)));
    apiRouter.post('/test-llm', this.wrapAsync(this.healthController.testLLMConnection.bind(this.healthController)));

    // Statement processing routes
    apiRouter.post('/statements/process', this.wrapAsync(this.statementController.processStatement.bind(this.statementController)));
    apiRouter.get('/statements/processing/:processingId', this.wrapAsync(this.statementController.getProcessingStatus.bind(this.statementController)));

    // Root health check (for load balancers)
    this.app.get('/health', this.wrapAsync(this.healthController.getHealth.bind(this.healthController)));
    
    // API documentation endpoint
    this.app.get('/api', (_req: Request, res: Response) => {
      res.json({
        name: 'Mi Expense App API',
        version: '1.0.0',
        environment: this.config.environment,
        endpoints: {
          health: {
            'GET /health': 'Basic health check',
            'GET /api/v1/health': 'Basic health check',
            'GET /api/v1/health/detailed': 'Detailed health check with system metrics',
            'GET /api/v1/status': 'Application status and metrics',
            'POST /api/v1/test-llm': 'Test LLM connection'
          },
          statements: {
            'POST /api/v1/statements/process': 'Process PDF statement',
            'GET /api/v1/statements/processing/:id': 'Get processing status'
          }
        },
        documentation: {
          'POST /api/v1/statements/process': {
            description: 'Upload and process a credit card statement PDF',
            requestBody: {
              pdfData: 'Base64 encoded PDF file',
              extractorConfig: {
                provider: 'gemini | github',
                apiKey: 'API key for the provider',
                model: 'Optional model name'
              }
            },
            responses: {
              200: 'Processing successful',
              400: 'Invalid request',
              413: 'File too large (max 1MB)',
              422: 'Processing failed',
              500: 'Server error'
            }
          }
        }
      });
    });

    // Catch-all for undefined routes
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Route not found',
        path: req.path,
        method: req.method,
        availableEndpoints: '/api'
      });
    });
  }

  /**
   * Setup error handling middleware
   */
  private setupErrorHandling(): void {
    // Global error handler
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.app.use((error: AppError, req: Request, res: Response, _next: NextFunction): void => {
      // Log error
      console.error('Express error:', {
        message: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });

      // Handle specific error types
      if (error.type === 'entity.parse.failed') {
        res.status(400).json({
          error: 'Invalid JSON in request body',
          details: 'Request body must be valid JSON'
        });
        return;
      }

      if (error.type === 'entity.too.large') {
        res.status(413).json({
          error: 'Request entity too large',
          details: 'Request body exceeds maximum allowed size'
        });
        return;
      }

      // Default error response
      const statusCode = error.statusCode || 500;
      const message = this.config.environment === 'development' 
        ? error.message 
        : statusCode >= 500 ? 'Internal server error' : error.message;

      res.status(statusCode).json({
        error: message,
        timestamp: new Date().toISOString(),
        path: req.path,
        ...(this.config.environment === 'development' && { stack: error.stack })
      });
    });
  }

  /**
   * Wrap async route handlers to catch errors
   */
  private wrapAsync(fn: Function) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res)).catch(next);
      return Promise.resolve(); // Add explicit return
    };
  }

  /**
   * Start the server
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      const server = this.app.listen(this.config.port, () => {
        console.log(`\n🚀 Mi Expense App Server Started`);
        console.log(`📍 Environment: ${this.config.environment}`);
        console.log(`🌐 Server: http://localhost:${this.config.port}`);
        console.log(`🏥 Health: http://localhost:${this.config.port}/health`);
        console.log(`📖 API Docs: http://localhost:${this.config.port}/api`);
        console.log(`📝 Statement Processing: http://localhost:${this.config.port}/api/v1/statements/process`);
        console.log(`🔒 CORS Origins: ${this.config.corsOrigins.join(', ')}`);
        console.log('');
        resolve();
      });

      // Graceful shutdown
      const gracefulShutdown = (signal: string) => {
        console.log(`\n📴 Received ${signal}. Starting graceful shutdown...`);
        server.close(() => {
          console.log('✅ Server closed. Exiting process.');
          process.exit(0);
        });
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    });
  }

  /**
   * Get the Express app instance (for testing)
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * Get server configuration
   */
  getConfig(): ServerConfig {
    return { ...this.config };
  }
}