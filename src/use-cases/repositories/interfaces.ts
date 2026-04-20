/**
 * Repository Interfaces for Data Access
 * 
 * These interfaces define the contracts for data access and storage operations.
 * They abstract away the specific implementation details of data persistence.
 */

import { ExpenseStatement } from '../../domain/entities/expense-statement.entity';
import { Transaction } from '../../domain/entities/transaction.entity';
import { Category } from '../../domain/entities/category.entity';

// Common repository result types
export interface RepositoryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// Storage and file interfaces
export interface IFileStorage {
  store(key: string, data: Buffer | string): Promise<string>;
  retrieve(key: string): Promise<Buffer | string>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  listFiles(prefix?: string): Promise<string[]>;
}

export interface IStatementRepository {
  save(statement: ExpenseStatement): Promise<RepositoryResult<string>>;
  findById(id: string): Promise<RepositoryResult<ExpenseStatement>>;
  findByAccountAndPeriod(accountNumber: string, periodStart: Date, periodEnd: Date): Promise<RepositoryResult<ExpenseStatement>>;
  findByBank(bank: string, limit?: number, offset?: number): Promise<RepositoryResult<PaginatedResult<ExpenseStatement>>>;
  findAll(limit?: number, offset?: number): Promise<RepositoryResult<PaginatedResult<ExpenseStatement>>>;
  update(statement: ExpenseStatement): Promise<RepositoryResult<void>>;
  delete(id: string): Promise<RepositoryResult<void>>;
  findRecent(limit: number): Promise<RepositoryResult<ExpenseStatement[]>>;
}

export interface ITransactionRepository {
  save(transaction: Transaction): Promise<RepositoryResult<string>>;
  saveBatch(transactions: Transaction[]): Promise<RepositoryResult<string[]>>;
  findById(id: string): Promise<RepositoryResult<Transaction>>;
  findByStatementId(statementId: string): Promise<RepositoryResult<Transaction[]>>;
  findByCategory(categoryName: string, limit?: number, offset?: number): Promise<RepositoryResult<PaginatedResult<Transaction>>>;
  findByDateRange(startDate: Date, endDate: Date): Promise<RepositoryResult<Transaction[]>>;
  findByMerchant(merchant: string): Promise<RepositoryResult<Transaction[]>>;
  findUncategorized(limit?: number, offset?: number): Promise<RepositoryResult<PaginatedResult<Transaction>>>;
  update(transaction: Transaction): Promise<RepositoryResult<void>>;
  delete(id: string): Promise<RepositoryResult<void>>;
  deleteByStatementId(statementId: string): Promise<RepositoryResult<void>>;
}

export interface ICategoryRepository {
  findAll(): Promise<RepositoryResult<Category[]>>;
  findById(id: string): Promise<RepositoryResult<Category>>;
  findByName(name: string): Promise<RepositoryResult<Category>>;
  save(category: Category): Promise<RepositoryResult<string>>;
  update(category: Category): Promise<RepositoryResult<void>>;
  delete(id: string): Promise<RepositoryResult<void>>;
  findByTags(tags: string[]): Promise<RepositoryResult<Category[]>>;
  searchByDescription(description: string): Promise<RepositoryResult<Category[]>>;
}

export interface IProcessingLogRepository {
  logProcessingStart(requestId: string, fileName: string, bank: string): Promise<RepositoryResult<void>>;
  logProcessingStep(requestId: string, step: string, status: 'success' | 'failure', details?: any): Promise<RepositoryResult<void>>;
  logProcessingComplete(requestId: string, success: boolean, finalResult?: any): Promise<RepositoryResult<void>>;
  findLogsByRequestId(requestId: string): Promise<RepositoryResult<any[]>>;
  findLogsByDateRange(startDate: Date, endDate: Date): Promise<RepositoryResult<any[]>>;
  cleanupOldLogs(olderThanDays: number): Promise<RepositoryResult<number>>;
}

// Analytics and reporting repositories
export interface IAnalyticsRepository {
  getCategoryBreakdown(statementId: string): Promise<RepositoryResult<any>>;
  getSpendingTrends(accountNumber: string, months: number): Promise<RepositoryResult<any[]>>;
  getMerchantAnalysis(accountNumber: string, limit?: number): Promise<RepositoryResult<any[]>>;
  getMonthlyComparison(accountNumber: string, year: number): Promise<RepositoryResult<any>>;
  getCategorizationStats(): Promise<RepositoryResult<{
    totalTransactions: number;
    categorizedTransactions: number;
    categorizationPercentage: number;
    topCategories: Array<{ name: string; count: number; percentage: number; }>;
  }>>;
}

// Configuration repository for dynamic settings
export interface IConfigRepository {
  getSetting(key: string): Promise<RepositoryResult<string>>;
  setSetting(key: string, value: string): Promise<RepositoryResult<void>>;
  getAllSettings(): Promise<RepositoryResult<Record<string, string>>>;
  deleteSetting(key: string): Promise<RepositoryResult<void>>;
}

// Caching interface for performance optimization
export interface ICacheRepository {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(pattern?: string): Promise<number>;
  exists(key: string): Promise<boolean>;
}

// Combined interface for all repositories (for DI convenience)
export interface IRepositories {
  statements: IStatementRepository;
  transactions: ITransactionRepository;
  categories: ICategoryRepository;
  processingLogs: IProcessingLogRepository;
  analytics: IAnalyticsRepository;
  config: IConfigRepository;
  cache: ICacheRepository;
  fileStorage: IFileStorage;
}

// Repository factory interface
export interface IRepositoryFactory {
  createStatementRepository(): IStatementRepository;
  createTransactionRepository(): ITransactionRepository;
  createCategoryRepository(): ICategoryRepository;
  createProcessingLogRepository(): IProcessingLogRepository;
  createAnalyticsRepository(): IAnalyticsRepository;
  createConfigRepository(): IConfigRepository;
  createCacheRepository(): ICacheRepository;
  createFileStorage(): IFileStorage;
  createRepositories(): IRepositories;
}