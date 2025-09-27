const { createSuccessResponse, createErrorResponse } = require('./utils');

exports.handler = async (event) => {
  try {
    console.log('Health check requested');

    // Basic health check information
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'CallMyEcho',
      version: '1.0.0',
      environment: process.env.STAGE || 'unknown',
      checks: {
        lambda: 'healthy',
        environment_variables: checkEnvironmentVariables(),
        api_connectivity: await checkAPIConnectivity()
      }
    };

    // Determine overall health status
    const allChecksHealthy = Object.values(healthData.checks).every(
      check => check === 'healthy' || check === true
    );

    if (!allChecksHealthy) {
      healthData.status = 'degraded';
    }

    const statusCode = allChecksHealthy ? 200 : 503;

    return createSuccessResponse(healthData, statusCode);

  } catch (error) {
    console.error('Health check failed:', error);
    return createErrorResponse('Health check failed', 503, {
      error: error.message
    });
  }
};

function checkEnvironmentVariables() {
  const requiredVars = [
    'HUME_API_KEY',
    'HUME_SECRET_KEY',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_ACCOUNT_SID'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    console.warn('Missing environment variables:', missing);
    return `missing: ${missing.join(', ')}`;
  }

  return 'healthy';
}

async function checkAPIConnectivity() {
  try {
    // Simple connectivity checks without making actual API calls
    // to avoid unnecessary usage charges

    const checks = {
      hume_evi: process.env.HUME_API_KEY && process.env.HUME_SECRET_KEY ? 'configured' : 'missing_keys',
      twilio: process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'missing_keys'
    };

    const allConfigured = Object.values(checks).every(check => check === 'configured');

    return allConfigured ? 'healthy' : `issues: ${JSON.stringify(checks)}`;

  } catch (error) {
    console.error('API connectivity check failed:', error);
    return `error: ${error.message}`;
  }
}