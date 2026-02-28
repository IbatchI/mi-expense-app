/**
 * Use Case Dependency Injection Setup
 * 
 * Configures all use cases, repositories, and gateways in the DI container.
 * Provides factory functions for creating properly configured use case instances.
 */

import { DIContainer, SERVICE_TOKENS } from '../../infrastructure/di/container';
import { AppConfig } from '../../infrastructure/config/configuration.factory';

// Use Cases
import { BankDetectionUseCase } from '../implementations/bank-detection.use-case';
import { PDFProcessingUseCase } from '../implementations/pdf-processing.use-case';
import { StatementExtractionUseCase } from '../implementations/statement-extraction.use-case';
import { ExpenseCategorializationUseCase } from '../implementations/expense-categorization.use-case';
import { LLMConnectionTestUseCase } from '../implementations/llm-connection-test.use-case';
import { CompleteFileProcessingUseCase } from '../implementations/complete-file-processing.use-case';

// Gateways
import {
  PDFProcessorGateway,
  BankDetectionGateway,
  TextPreprocessorGateway,
  LLMExtractionGateway,
  ExpenseClassificationGateway
} from '../../adapters/gateways';

// Domain Services
import { CategoryManagementService } from '../../domain/services/category-management.service';

/**
 * Use Case Factory for creating configured use case instances
 */
export class UseCaseFactory {
  constructor(private readonly container: DIContainer) {}

  /**
   * Creates and registers all use cases in the DI container
   */
  static registerUseCases(container: DIContainer, config: AppConfig): void {
    const factory = new UseCaseFactory(container);

    // Register domain services first
    factory.registerDomainServices();

    // Register gateways
    factory.registerGateways(config);

    // Register repositories (mock implementations for now)
    factory.registerRepositories();

    // Register use cases
    factory.registerUseCaseImplementations();
  }

  private registerDomainServices(): void {
    this.container.registerSingleton(
      'CategoryManagementService',
      () => new CategoryManagementService()
    );
  }

  private registerGateways(config: AppConfig): void {
    // PDF Processor Gateway
    this.container.registerTransient(
      'PDFProcessorGateway',
      () => new PDFProcessorGateway()
    );

    // Bank Detection Gateway
    this.container.registerSingleton(
      'BankDetectionGateway',
      () => new BankDetectionGateway()
    );

    // Text Preprocessor Gateway
    this.container.registerTransient(
      'TextPreprocessorGateway',
      () => new TextPreprocessorGateway()
    );

    // LLM Extraction Gateway
    this.container.registerTransient(
      'LLMExtractionGateway',
      () => new LLMExtractionGateway(config.llm)
    );

    // Expense Classification Gateway
    this.container.registerTransient(
      'ExpenseClassificationGateway',
      () => {
        const llmGateway = this.container.resolve('LLMExtractionGateway');
        return new ExpenseClassificationGateway(llmGateway);
      }
    );
  }

  private registerRepositories(): void {
    // For Phase 2, we'll use mock repositories
    // These will be replaced with real implementations in Phase 3

    // Mock Statement Repository
    this.container.registerSingleton(
      SERVICE_TOKENS.STATEMENT_REPOSITORY.name,
      () => ({
        save: async (_statement: any) => ({ 
          success: true, 
          data: `stmt_${Date.now()}` 
        }),
        findById: async (_id: string) => ({ 
          success: false, 
          error: 'Not implemented' 
        }),
        findByAccountAndPeriod: async () => ({ 
          success: false, 
          error: 'Not implemented' 
        }),
        findByBank: async () => ({ 
          success: false, 
          error: 'Not implemented' 
        }),
        findAll: async () => ({ 
          success: false, 
          error: 'Not implemented' 
        }),
        update: async () => ({ 
          success: false, 
          error: 'Not implemented' 
        }),
        delete: async () => ({ 
          success: false, 
          error: 'Not implemented' 
        }),
        findRecent: async () => ({ 
          success: false, 
          error: 'Not implemented' 
        })
      })
    );

    // Mock Category Repository
    this.container.registerSingleton(
      'CategoryRepository',
      () => {
        const categoryService = this.container.resolve('CategoryManagementService') as CategoryManagementService;
        return {
          findAll: async () => ({
            success: true,
            data: categoryService.getBuiltInCategories()
          }),
          findById: async () => ({ 
            success: false, 
            error: 'Not implemented' 
          }),
          findByName: async () => ({ 
            success: false, 
            error: 'Not implemented' 
          }),
          save: async () => ({ 
            success: false, 
            error: 'Not implemented' 
          }),
          update: async () => ({ 
            success: false, 
            error: 'Not implemented' 
          }),
          delete: async () => ({ 
            success: false, 
            error: 'Not implemented' 
          }),
          findByTags: async () => ({ 
            success: false, 
            error: 'Not implemented' 
          }),
          searchByDescription: async () => ({ 
            success: false, 
            error: 'Not implemented' 
          })
        };
      }
    );
  }

  private registerUseCaseImplementations(): void {
    // Bank Detection Use Case
    this.container.registerTransient(
      'BankDetectionUseCase',
      () => new BankDetectionUseCase(
        this.container.resolve('BankDetectionGateway'),
        this.container.resolve(SERVICE_TOKENS.LOGGER.name)
      )
    );

    // PDF Processing Use Case
    this.container.registerTransient(
      'PDFProcessingUseCase',
      () => new PDFProcessingUseCase(
        this.container.resolve('PDFProcessorGateway'),
        this.container.resolve('TextPreprocessorGateway'),
        this.container.resolve(SERVICE_TOKENS.LOGGER.name)
      )
    );

    // Statement Extraction Use Case
    this.container.registerTransient(
      'StatementExtractionUseCase',
      () => new StatementExtractionUseCase(
        this.container.resolve('LLMExtractionGateway'),
        this.container.resolve(SERVICE_TOKENS.LOGGER.name)
      )
    );

    // Expense Categorization Use Case
    this.container.registerTransient(
      'ExpenseCategorializationUseCase',
      () => new ExpenseCategorializationUseCase(
        this.container.resolve('ExpenseClassificationGateway'),
        this.container.resolve('CategoryRepository'),
        this.container.resolve(SERVICE_TOKENS.LOGGER.name)
      )
    );

    // LLM Connection Test Use Case
    this.container.registerTransient(
      'LLMConnectionTestUseCase',
      () => new LLMConnectionTestUseCase(
        this.container.resolve('LLMExtractionGateway'),
        this.container.resolve(SERVICE_TOKENS.LOGGER.name)
      )
    );

    // Complete File Processing Use Case (orchestrator)
    this.container.registerTransient(
      'CompleteFileProcessingUseCase',
      () => new CompleteFileProcessingUseCase(
        this.container.resolve('BankDetectionUseCase'),
        this.container.resolve('PDFProcessingUseCase'),
        this.container.resolve('StatementExtractionUseCase'),
        this.container.resolve('ExpenseCategorializationUseCase'),
        this.container.resolve('LLMConnectionTestUseCase'),
        this.container.resolve(SERVICE_TOKENS.STATEMENT_REPOSITORY.name),
        this.container.resolve(SERVICE_TOKENS.LOGGER.name)
      )
    );
  }

  /**
   * Convenience methods for getting specific use cases
   */
  getBankDetectionUseCase(): BankDetectionUseCase {
    return this.container.resolve('BankDetectionUseCase');
  }

  getPDFProcessingUseCase(): PDFProcessingUseCase {
    return this.container.resolve('PDFProcessingUseCase');
  }

  getStatementExtractionUseCase(): StatementExtractionUseCase {
    return this.container.resolve('StatementExtractionUseCase');
  }

  getExpenseCategorializationUseCase(): ExpenseCategorializationUseCase {
    return this.container.resolve('ExpenseCategorializationUseCase');
  }

  getLLMConnectionTestUseCase(): LLMConnectionTestUseCase {
    return this.container.resolve('LLMConnectionTestUseCase');
  }

  getCompleteFileProcessingUseCase(): CompleteFileProcessingUseCase {
    return this.container.resolve('CompleteFileProcessingUseCase');
  }
}

/**
 * Bootstrap function for setting up all use cases
 */
export function bootstrapUseCases(container: DIContainer, config: AppConfig): UseCaseFactory {
  // Register essential services first
  registerEssentialServices(container, config);
  
  // Register use cases
  UseCaseFactory.registerUseCases(container, config);
  return new UseCaseFactory(container);
}

/**
 * Register essential services required by use cases
 */
function registerEssentialServices(container: DIContainer, config: AppConfig): void {
  // Register a simple logger
  const logger = {
    info: (message: string, meta?: any) => console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta) : ''),
    warn: (message: string, meta?: any) => console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : ''),
    error: (message: string, meta?: any) => console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta) : ''),
    debug: (message: string, meta?: any) => console.log(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : '')
  };
  
  container.registerInstance(SERVICE_TOKENS.LOGGER.name, logger);
  container.registerInstance(SERVICE_TOKENS.CONFIG.name, config);
  container.registerInstance(SERVICE_TOKENS.ENVIRONMENT.name, config.environment);
}