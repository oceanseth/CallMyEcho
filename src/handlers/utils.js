const crypto = require('crypto');
const fetch = require('node-fetch');

/**
 * Validates Twilio signature for webhook security
 * @param {Object} event - Lambda event object
 * @returns {boolean} - True if signature is valid
 */
function validateTwilioSignature(event) {
  try {
    const twilioSignature = event.headers['X-Twilio-Signature'] || event.headers['x-twilio-signature'];

    if (!twilioSignature) {
      console.warn('No Twilio signature found in headers');
      return false;
    }

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
      console.error('TWILIO_AUTH_TOKEN environment variable not set');
      return false;
    }

    // Construct the full URL
    const protocol = event.headers['X-Forwarded-Proto'] || 'https';
    const host = event.headers.Host;
    const path = event.requestContext.path;
    const url = `${protocol}://${host}${path}`;

    // Create the expected signature
    const body = event.body || '';
    const data = url + body;
    const expectedSignature = crypto
      .createHmac('sha1', authToken)
      .update(data, 'utf-8')
      .digest('base64');

    // Compare signatures
    const isValid = crypto.timingSafeEqual(
      Buffer.from(twilioSignature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      console.error('Twilio signature validation failed');
      console.error('Expected:', expectedSignature);
      console.error('Received:', twilioSignature);
    }

    return isValid;

  } catch (error) {
    console.error('Error validating Twilio signature:', error);
    return false;
  }
}

/**
 * Downloads audio file from a URL
 * @param {string} url - URL to download audio from
 * @param {Object} options - Additional options (headers, etc.)
 * @returns {Promise<Buffer>} - Audio file as buffer
 */
async function downloadAudio(url, options = {}) {
  try {
    console.log(`Downloading audio from: ${url}`);

    const headers = {
      'User-Agent': 'CallMyEcho/1.0',
      ...options.headers
    };

    // Add Twilio credentials if it's a Twilio URL
    if (url.includes('api.twilio.com')) {
      const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

      if (twilioAccountSid && twilioAuthToken) {
        const credentials = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      timeout: options.timeout || 30000 // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('audio/')) {
      console.warn(`Unexpected content type: ${contentType}`);
    }

    const audioBuffer = await response.buffer();
    console.log(`Downloaded ${audioBuffer.length} bytes of audio data`);

    return audioBuffer;

  } catch (error) {
    console.error('Error downloading audio:', error);
    throw new Error(`Audio download failed: ${error.message}`);
  }
}

/**
 * Uploads a file to a temporary storage (could be S3, etc.)
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - Name for the file
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} - URL to the uploaded file
 */
async function uploadFile(buffer, filename, contentType) {
  // For now, return a placeholder - in production you might use S3
  // This would be implemented based on your storage requirements
  console.log(`Would upload file: ${filename} (${buffer.length} bytes, ${contentType})`);
  return `https://temp-storage.callmyecho.com/${filename}`;
}

/**
 * Retries an async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxAttempts - Maximum number of attempts
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise<any>} - Result of the function
 */
async function retryWithBackoff(fn, maxAttempts = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(`Failed after ${maxAttempts} attempts: ${lastError.message}`);
}

/**
 * Validates that required environment variables are set
 * @param {string[]} requiredVars - Array of required environment variable names
 * @throws {Error} - If any required variables are missing
 */
function validateEnvironmentVariables(requiredVars) {
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Sanitizes text for logging (removes sensitive information)
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeForLogging(text) {
  if (!text) return text;

  // Remove potential sensitive information
  return text
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_NUMBER]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b\d{10,}\b/g, '[PHONE_NUMBER]');
}

/**
 * Creates a standardized error response
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Object} details - Additional error details
 * @returns {Object} - Lambda response object
 */
function createErrorResponse(message, statusCode = 500, details = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      error: message,
      ...details,
      timestamp: new Date().toISOString()
    })
  };
}

/**
 * Creates a standardized success response
 * @param {Object} data - Response data
 * @param {number} statusCode - HTTP status code
 * @returns {Object} - Lambda response object
 */
function createSuccessResponse(data, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      success: true,
      data,
      timestamp: new Date().toISOString()
    })
  };
}

module.exports = {
  validateTwilioSignature,
  downloadAudio,
  uploadFile,
  retryWithBackoff,
  validateEnvironmentVariables,
  sanitizeForLogging,
  createErrorResponse,
  createSuccessResponse
};