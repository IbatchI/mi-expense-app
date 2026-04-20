/**
 * Development Server Entry Point
 * 
 * Starts the Express server for local development with full middleware stack,
 * CORS configuration, and development-specific logging.
 */

import { ExpressServer } from './express-server';
import { EnvHelpers } from '../../infrastructure/config/configuration.factory';

async function startDevelopmentServer(): Promise<void> {
  try {
    // Ensure we're in development mode
    if (!EnvHelpers.isDevelopment() && !EnvHelpers.isLocal()) {
      console.warn('⚠️  Starting Express server outside of development environment');
    }

    // Create and configure server
    const server = new ExpressServer({
      port: parseInt(process.env.PORT || '3001'),
      corsOrigins: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001'
      ],
      maxFileSize: 1024 * 1024, // 1MB
      environment: 'development'
    });

    // Start the server
    await server.start();

    console.log('✅ Development server ready for PDF processing!');
    console.log('🔄 Watching for file changes...');
    console.log('');
    console.log('📋 Available endpoints:');
    console.log('  • POST /api/v1/statements/process - Process PDF statements');
    console.log('  • GET  /health - Health check');
    console.log('  • GET  /api/v1/health/detailed - Detailed health check');
    console.log('  • POST /api/v1/test-llm - Test LLM connectivity');
    console.log('  • GET  /api - API documentation');
    console.log('');

  } catch (error) {
    console.error('❌ Failed to start development server:', error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
if (require.main === module) {
  startDevelopmentServer();
}

export { startDevelopmentServer };