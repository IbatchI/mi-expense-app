/**
 * Error Handling Middleware
 * 
 * Centralized error handling for Express routes with proper logging,
 * error classification, and appropriate HTTP responses.
 */

import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  type?: string;
  details?: any;
}

export class ErrorHandler {
  /**
   * Create an operational error (expected error that should be handled gracefully)
   */
  static createError(message: string, statusCode: number = 500, type?: string, details?: any): AppError {
    const error = new Error(message) as AppError;
    error.statusCode = statusCode;
    error.isOperational = true;
    if (type) {
      error.type = type;
    }
    error.details = details;
    return error;
  }

  /**
   * Create a validation error
   */
  static createValidationError(message: string, validationDetails?: any): AppError {
    return this.createError(message, 400, 'VALIDATION_ERROR', validationDetails);
  }

  /**
   * Create a business logic error
   */
  static createBusinessError(message: string, details?: any): AppError {
    return this.createError(message, 422, 'BUSINESS_ERROR', details);
  }

  /**
   * Create a not found error
   */
  static createNotFoundError(resource: string = 'Resource'): AppError {
    return this.createError(`${resource} not found`, 404, 'NOT_FOUND');
  }

  /**
   * Create a rate limit error
   */
  static createRateLimitError(message: string = 'Too many requests'): AppError {
    return this.createError(message, 429, 'RATE_LIMIT');
  }

  /**
   * Create a file too large error
   */
  static createFileTooLargeError(maxSize: string): AppError {
    return this.createError(
      `File too large. Maximum size is ${maxSize}`,
      413,
      'FILE_TOO_LARGE'
    );
  }

  /**
   * Create an unauthorized error
   */
  static createUnauthorizedError(message: string = 'Unauthorized'): AppError {
    return this.createError(message, 401, 'UNAUTHORIZED');
  }

  /**
   * Create a service unavailable error
   */
  static createServiceUnavailableError(service: string): AppError {
    return this.createError(
      `${service} is currently unavailable`,
      503,
      'SERVICE_UNAVAILABLE'
    );
  }
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handling middleware
 */
export function globalErrorHandler() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (error: AppError, req: Request, res: Response, _next: NextFunction): void => {
    // Log the error
    const errorLog = {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      type: error.type,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString(),
      requestId: req.get('X-Request-ID') || 'unknown'
    };

    // Log based on severity
    if (error.statusCode && error.statusCode >= 500) {
      console.error('❌ Server Error:', errorLog);
    } else if (error.statusCode && error.statusCode >= 400) {
      console.warn('⚠️ Client Error:', errorLog);
    } else {
      console.log('ℹ️ Request Error:', errorLog);
    }

    // Handle specific error types
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({
        error: 'Invalid JSON in request body',
        message: 'Request body must be valid JSON',
        type: 'PARSE_ERROR',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (error.type === 'entity.too.large') {
      res.status(413).json({
        error: 'Request entity too large',
        message: 'Request body exceeds maximum allowed size',
        type: 'ENTITY_TOO_LARGE',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Default error response
    const statusCode = error.statusCode || 500;
    const isProduction = process.env.NODE_ENV === 'production';
    
    const errorResponse: any = {
      error: isProduction && statusCode >= 500 ? 'Internal server error' : error.message,
      type: error.type || 'UNKNOWN_ERROR',
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      requestId: errorLog.requestId
    };

    // Add details in development mode
    if (!isProduction) {
      if (error.details) {
        errorResponse.details = error.details;
      }
      if (error.stack) {
        errorResponse.stack = error.stack;
      }
    }

    res.status(statusCode).json(errorResponse);
  };
}

/**
 * 404 handler for undefined routes
 */
export function notFoundHandler() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const error = ErrorHandler.createNotFoundError('Route');
    error.details = {
      path: req.path,
      method: req.method,
      suggestion: 'Check the API documentation for available endpoints'
    };
    next(error);
  };
}

/**
 * Request timeout handler
 */
export function timeoutHandler(timeoutMs: number = 300000) { // 5 minutes default
  return (req: Request, _res: Response, next: NextFunction) => {
    req.setTimeout(timeoutMs, () => {
      const error = ErrorHandler.createError(
        'Request timeout',
        408,
        'REQUEST_TIMEOUT',
        { timeoutMs }
      );
      next(error);
    });
    next();
  };
}

/**
 * Rate limiting helper
 */
export function createRateLimitError(windowMs: number, maxRequests: number): AppError {
  return ErrorHandler.createRateLimitError(
    `Too many requests. Maximum ${maxRequests} requests per ${windowMs / 1000} seconds allowed.`
  );
}