/**
 * Logging Middleware
 * 
 * Provides structured request/response logging with performance metrics,
 * error tracking, and development-friendly output formatting.
 */

import { Request, Response, NextFunction } from 'express';

export interface LogLevel {
  DEBUG: 'debug';
  INFO: 'info';
  WARN: 'warn';
  ERROR: 'error';
}

export const LOG_LEVELS: LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

export interface RequestLog {
  requestId: string;
  method: string;
  path: string;
  query?: any;
  userAgent: string;
  ip: string;
  timestamp: string;
  duration?: number;
  statusCode?: number;
  contentLength?: number | undefined;
  errorMessage?: string | undefined;
}

export class Logger {
  private static isDevelopment = process.env.NODE_ENV !== 'production';

  /**
   * Generate a unique request ID
   */
  static generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Format log entry for output
   */
  static formatLog(level: string, message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    
    if (this.isDevelopment) {
      // Pretty formatting for development
      const emoji = this.getLogEmoji(level);
      console.log(`${emoji} [${timestamp}] ${level.toUpperCase()}: ${message}`);
      
      if (meta) {
        console.log('   📋 Details:', JSON.stringify(meta, null, 2));
      }
    } else {
      // Structured JSON for production
      const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        message,
        ...(meta && { meta })
      };
      console.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Get emoji for log level
   */
  private static getLogEmoji(level: string): string {
    switch (level.toLowerCase()) {
      case 'debug': return '🔍';
      case 'info': return 'ℹ️';
      case 'warn': return '⚠️';
      case 'error': return '❌';
      default: return '📝';
    }
  }

  /**
   * Log debug message
   */
  static debug(message: string, meta?: any): void {
    this.formatLog(LOG_LEVELS.DEBUG, message, meta);
  }

  /**
   * Log info message
   */
  static info(message: string, meta?: any): void {
    this.formatLog(LOG_LEVELS.INFO, message, meta);
  }

  /**
   * Log warning message
   */
  static warn(message: string, meta?: any): void {
    this.formatLog(LOG_LEVELS.WARN, message, meta);
  }

  /**
   * Log error message
   */
  static error(message: string, meta?: any): void {
    this.formatLog(LOG_LEVELS.ERROR, message, meta);
  }

  /**
   * Log request start
   */
  static logRequestStart(req: Request): void {
    const requestLog: Partial<RequestLog> = {
      requestId: req.get('X-Request-ID') || this.generateRequestId(),
      method: req.method,
      path: req.path,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      userAgent: req.get('User-Agent') || 'unknown',
      ip: req.ip || 'unknown',
      timestamp: new Date().toISOString()
    };

    this.info(`${req.method} ${req.path}`, requestLog);
  }

  /**
   * Log request completion
   */
  static logRequestComplete(
    req: Request,
    res: Response,
    duration: number,
    error?: Error
  ): void {
    const requestLog: RequestLog = {
      requestId: req.get('X-Request-ID') || 'unknown',
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent') || 'unknown',
      ip: req.ip || 'unknown',
      timestamp: new Date().toISOString(),
      duration,
      statusCode: res.statusCode,
      contentLength: res.get('Content-Length') ? parseInt(res.get('Content-Length')!) : undefined,
      errorMessage: error?.message
    };

    const message = `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`;
    
    if (error) {
      this.error(message, requestLog);
    } else if (res.statusCode >= 400) {
      this.warn(message, requestLog);
    } else {
      this.info(message, requestLog);
    }
  }
}

/**
 * Request ID middleware
 */
export function requestIdMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.get('X-Request-ID') || Logger.generateRequestId();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  };
}

/**
 * Request logging middleware
 */
export function requestLoggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    // Log request start
    Logger.logRequestStart(req);

    // Capture the original end function
    const originalEnd = res.end;
    let requestCompleted = false;

    // Override the end function to log completion
    res.end = function(chunk?: any, encoding?: any) {
      if (!requestCompleted) {
        requestCompleted = true;
        const duration = Date.now() - startTime;
        Logger.logRequestComplete(req, res, duration);
      }
      return originalEnd.call(this, chunk, encoding);
    };

    // Handle errors
    res.on('error', (error: Error) => {
      if (!requestCompleted) {
        requestCompleted = true;
        const duration = Date.now() - startTime;
        Logger.logRequestComplete(req, res, duration, error);
      }
    });

    next();
  };
}

/**
 * Performance monitoring middleware
 */
export function performanceMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = process.hrtime.bigint();

    // Add performance timing to response
    res.on('finish', () => {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      
      res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);
      
      // Log slow requests
      if (duration > 5000) { // More than 5 seconds
        Logger.warn('Slow request detected', {
          method: req.method,
          path: req.path,
          duration: `${duration.toFixed(2)}ms`,
          requestId: req.get('X-Request-ID')
        });
      }
    });

    next();
  };
}

/**
 * Error logging middleware (to be used with error handler)
 */
export function errorLoggingMiddleware() {
  return (error: Error, req: Request, _res: Response, next: NextFunction): void => {
    // Log the error with full context
    Logger.error('Request error occurred', {
      message: error.message,
      stack: error.stack,
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      requestId: req.get('X-Request-ID'),
      timestamp: new Date().toISOString()
    });

    next(error);
  };
}

/**
 * Health check logging (lighter logging for health endpoints)
 */
export function healthCheckLoggingMiddleware() {
  const healthEndpoints = ['/health', '/status', '/ping', '/ready', '/live'];
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const isHealthEndpoint = healthEndpoints.some(endpoint => 
      req.path.endsWith(endpoint)
    );

    if (isHealthEndpoint) {
      // Only log health check failures
      const originalEnd = res.end;
      res.end = function(chunk?: any, encoding?: any) {
        if (res.statusCode >= 400) {
          Logger.warn(`Health check failed: ${req.path} - ${res.statusCode}`, {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            timestamp: new Date().toISOString()
          });
        }
        return originalEnd.call(this, chunk, encoding);
      };
    }

    next();
  };
}