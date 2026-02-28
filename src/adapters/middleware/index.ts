/**
 * Middleware Index
 * 
 * Central export point for all middleware functions.
 * Provides convenient imports for Express server setup.
 */

// Error handling middleware
export {
  AppError,
  ErrorHandler,
  asyncHandler,
  globalErrorHandler,
  notFoundHandler,
  timeoutHandler,
  createRateLimitError
} from './error-handler.middleware';

// Logging middleware
export {
  LogLevel,
  LOG_LEVELS,
  RequestLog,
  Logger,
  requestIdMiddleware,
  requestLoggingMiddleware,
  performanceMiddleware,
  errorLoggingMiddleware,
  healthCheckLoggingMiddleware
} from './logging.middleware';

// Import for use in factory functions
import {
  requestIdMiddleware,
  requestLoggingMiddleware,
  performanceMiddleware,
  errorLoggingMiddleware,
  healthCheckLoggingMiddleware
} from './logging.middleware';

import {
  globalErrorHandler,
  notFoundHandler,
  timeoutHandler
} from './error-handler.middleware';

// Middleware stack factory
export function createMiddlewareStack() {
  return {
    // Request processing
    requestId: requestIdMiddleware(),
    logging: requestLoggingMiddleware(),
    performance: performanceMiddleware(),
    timeout: timeoutHandler(),
    healthCheckLogging: healthCheckLoggingMiddleware(),

    // Error handling
    errorLogging: errorLoggingMiddleware(),
    errorHandler: globalErrorHandler(),
    notFound: notFoundHandler()
  };
}

// Common middleware combinations
export const commonMiddleware = {
  // Development middleware stack
  development: [
    requestIdMiddleware(),
    requestLoggingMiddleware(),
    performanceMiddleware(),
    healthCheckLoggingMiddleware(),
    timeoutHandler()
  ],

  // Production middleware stack (lighter logging)
  production: [
    requestIdMiddleware(),
    performanceMiddleware(),
    healthCheckLoggingMiddleware(),
    timeoutHandler(60000) // Shorter timeout in production
  ],

  // Error handling stack (always last)
  errorHandling: [
    errorLoggingMiddleware(),
    globalErrorHandler(),
    notFoundHandler()
  ]
};