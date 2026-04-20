/**
 * AWS Lambda Handler
 * 
 * Handles serverless deployment for production environments.
 * Provides API Gateway integration for PDF statement processing.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { StatementController } from '../controllers/statement.controller';
import { HealthController } from '../controllers/health.controller';
import { ConfigurationFactory } from '../../infrastructure/config/configuration.factory';
import { bootstrapUseCases } from '../../use-cases/setup/dependency-injection.setup';
import { DIContainer } from '../../infrastructure/di/container';

// Lambda-specific request/response adapters
interface LambdaRequest {
  body: any;
  params: { [key: string]: string };
  query: { [key: string]: string | string[] };
}

interface LambdaResponse {
  status(code: number): LambdaResponse;
  json(data: any): void;
  statusCode?: number;
  responseData?: any;
}

class LambdaResponseAdapter implements LambdaResponse {
  public statusCode: number = 200;
  public responseData: any = null;

  status(code: number): LambdaResponse {
    this.statusCode = code;
    return this;
  }

  json(data: any): void {
    this.responseData = data;
  }

  toAPIGatewayResponse(): APIGatewayProxyResult {
    return {
      statusCode: this.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Credentials': 'true',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      },
      body: JSON.stringify(this.responseData || {})
    };
  }
}

// Global controllers (initialized once per Lambda container)
let statementController: StatementController;
let healthController: HealthController;
let isInitialized = false;

/**
 * Initialize controllers with dependency injection
 */
async function initializeControllers(): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    const appConfig = ConfigurationFactory.createConfiguration();
    const container = new DIContainer();
    const useCaseFactory = bootstrapUseCases(container, appConfig);
    
    statementController = new StatementController(
      useCaseFactory.getCompleteFileProcessingUseCase()
    );
    
    healthController = new HealthController(
      useCaseFactory.getLLMConnectionTestUseCase()
    );

    isInitialized = true;
    console.log('✅ Lambda controllers initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Lambda controllers:', error);
    throw error;
  }
}

/**
 * Convert API Gateway event to our request format
 */
function createLambdaRequest(event: APIGatewayProxyEvent): LambdaRequest {
  let body: any = {};
  
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch (error) {
      console.warn('Failed to parse request body as JSON:', error);
      body = {};
    }
  }

  return {
    body,
    params: (event.pathParameters || {}) as { [key: string]: string },
    query: (event.queryStringParameters || {}) as { [key: string]: string | string[] }
  };
}

/**
 * Route handler for different API endpoints
 */
async function routeHandler(
  method: string,
  path: string,
  req: LambdaRequest,
  res: LambdaResponse
): Promise<void> {
  const normalizedPath = path.replace(/^\/api\/v1/, '').replace(/\/$/, '') || '/';
  
  console.log(`Processing ${method} ${normalizedPath}`);

  try {
    switch (method) {
      case 'GET':
        await handleGetRequest(normalizedPath, req, res);
        break;
      case 'POST':
        await handlePostRequest(normalizedPath, req, res);
        break;
      case 'OPTIONS':
        // CORS preflight
        res.status(200).json({ message: 'OK' });
        break;
      default:
        res.status(405).json({
          error: 'Method not allowed',
          method,
          allowedMethods: ['GET', 'POST', 'OPTIONS']
        });
    }
  } catch (error) {
    console.error('Route handler error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Handle GET requests
 */
async function handleGetRequest(path: string, req: LambdaRequest, res: LambdaResponse): Promise<void> {
  switch (path) {
    case '/health':
      await healthController.getHealth(req, res);
      break;
    case '/health/detailed':
      await healthController.getDetailedHealth(req, res);
      break;
    case '/status':
      await healthController.getStatus(req, res);
      break;
    case '/statements/processing':
      // Extract processing ID from path
      const processingId = req.params.processingId || 'unknown';
      req.params = { processingId };
      await statementController.getProcessingStatus(req, res);
      break;
    case '/':
    case '/api':
      res.status(200).json({
        name: 'Mi Expense App Lambda API',
        version: '1.0.0',
        environment: 'production',
        runtime: 'AWS Lambda',
        endpoints: {
          health: {
            'GET /health': 'Basic health check',
            'GET /health/detailed': 'Detailed health check',
            'GET /status': 'Application status'
          },
          statements: {
            'POST /statements/process': 'Process PDF statement'
          },
          test: {
            'POST /test-llm': 'Test LLM connection'
          }
        }
      });
      break;
    default:
      res.status(404).json({
        error: 'Endpoint not found',
        path,
        availableEndpoints: ['/health', '/health/detailed', '/status', '/statements/process', '/test-llm']
      });
  }
}

/**
 * Handle POST requests
 */
async function handlePostRequest(path: string, req: LambdaRequest, res: LambdaResponse): Promise<void> {
  switch (path) {
    case '/statements/process':
      await statementController.processStatement(req, res);
      break;
    case '/test-llm':
      await healthController.testLLMConnection(req, res);
      break;
    default:
      res.status(404).json({
        error: 'Endpoint not found',
        path,
        method: 'POST',
        availableEndpoints: ['/statements/process', '/test-llm']
      });
  }
}

/**
 * Main Lambda handler
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  // Set Lambda context timeout
  context.callbackWaitsForEmptyEventLoop = false;

  const startTime = Date.now();
  console.log('🚀 Lambda handler started', {
    requestId: context.awsRequestId,
    method: event.httpMethod,
    path: event.path,
    userAgent: event.headers['User-Agent'] || 'unknown'
  });

  try {
    // Initialize controllers if needed
    await initializeControllers();

    // Create request/response adapters
    const req = createLambdaRequest(event);
    const res = new LambdaResponseAdapter();

    // Route the request
    await routeHandler(event.httpMethod, event.path, req, res);

    // Convert to API Gateway response format
    const response = res.toAPIGatewayResponse();
    
    const duration = Date.now() - startTime;
    console.log('✅ Lambda handler completed', {
      requestId: context.awsRequestId,
      statusCode: response.statusCode,
      duration: `${duration}ms`
    });

    return response;

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Lambda handler error:', {
      requestId: context.awsRequestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: `${duration}ms`,
      stack: error instanceof Error ? error.stack : undefined
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        requestId: context.awsRequestId,
        message: error instanceof Error ? error.message : 'Lambda handler failed'
      })
    };
  }
};

/**
 * Health check handler for ALB/ELB
 */
export const healthCheck = async (): Promise<APIGatewayProxyResult> => {
  try {
    await initializeControllers();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'mi-expense-app-lambda'
      })
    };
  } catch (error) {
    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      })
    };
  }
};