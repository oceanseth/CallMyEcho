# CallMyEcho - Twilio & Hume EVI Integration Service

A serverless voice processing service that integrates Twilio phone calls with Hume's Empathic Voice Interface (EVI) for complete emotional speech-to-speech processing.

## Architecture

```
Twilio Call → Recording → Webhook → Lambda → Hume EVI
                                         ↓
              Complete Speech-to-Speech Processing
              (Transcription + Understanding + Emotional Response)
```

## Features

- **Twilio Integration**: Receives call recordings via webhooks
- **Hume EVI**: Complete emotional speech-to-speech processing pipeline
  - Real-time speech transcription with emotional analysis
  - Empathic understanding and response generation
  - Emotional text-to-speech synthesis
- **AWS Serverless**: Lambda functions with API Gateway and Route53
- **Secure**: Twilio signature validation and encrypted WebSocket communication

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **Twilio Account** with phone number and recording enabled
3. **Hume AI Account** with API key and secret for EVI access
4. **Node.js 20.x** for local development
5. **Serverless Framework** installed globally

## Environment Variables

Create a `.env` file or set the following environment variables:

```bash
# Hume AI EVI (for complete speech-to-speech processing)
HUME_API_KEY=your_hume_api_key
HUME_SECRET_KEY=your_hume_secret_key

# Twilio (for webhook validation)
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_ACCOUNT_SID=your_twilio_account_sid
```

## Installation

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd CallMyEcho
npm install
```

2. **Install Serverless Framework:**
```bash
npm install -g serverless
```

3. **Configure AWS credentials:**
```bash
aws configure
# or
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
```

## Deployment

### Step 1: Deploy Route53 Infrastructure (First Time Only)

```bash
# Deploy the Route53 hosted zone and SSL certificate
aws cloudformation deploy \
  --template-file cloudformation/route53.yml \
  --stack-name callmyecho-route53 \
  --parameter-overrides DomainName=callmyecho.com Environment=prod \
  --capabilities CAPABILITY_IAM
```

**Important**: After this deployment, you'll need to:
1. Update your domain's name servers to point to the Route53 hosted zone
2. Wait for DNS propagation (can take up to 48 hours)
3. Wait for SSL certificate validation (usually 5-30 minutes)

### Step 2: Deploy Application

```bash
# Development deployment
npm run deploy

# Production deployment
npm run deploy:prod
```

### Step 3: Configure Custom Domain (After Route53 Setup)

```bash
# Create the custom domain
serverless create_domain --stage prod

# Deploy again to connect the custom domain
serverless deploy --stage prod
```

## Twilio Configuration

### 1. Configure Recording

In your Twilio Console:
1. Go to Phone Numbers → Manage → Active numbers
2. Click on your phone number
3. In the Voice section, set:
   - **Webhook URL**: `https://prod.callmyecho.com/webhook/twilio`
   - **HTTP Method**: POST
   - **Record Calls**: True

### 2. Configure Recording Webhook

In your Twilio Console:
1. Go to Voice → Configure → General Settings
2. Set **Recording Status Callback URL**: `https://prod.callmyecho.com/webhook/twilio`
3. Enable **Status Callback Events**: `recording-completed`

## API Endpoints

- **POST /webhook/twilio**: Twilio webhook handler for call recordings
- **GET /health**: Health check endpoint

## Local Development

```bash
# Install dependencies
npm install

# Run locally (requires serverless-offline)
serverless offline start

# Test webhook locally with ngrok
ngrok http 3000
# Use the ngrok URL for Twilio webhook configuration
```

## Testing

1. **Call your Twilio number**
2. **Leave a voice message**
3. **Check CloudWatch logs** for processing status:
```bash
npm run logs
```

## Monitoring

### CloudWatch Logs
```bash
# View recent logs
aws logs tail /aws/lambda/callmyecho-prod-twilioWebhook --follow

# Or use serverless
serverless logs -f twilioWebhook --stage prod --tail
```

### Route53 Health Checks
- Health checks monitor `https://prod.callmyecho.com/health`
- CloudWatch alarms notify if health checks fail

## Troubleshooting

### Common Issues

1. **"Invalid Twilio signature"**
   - Check `TWILIO_AUTH_TOKEN` environment variable
   - Verify webhook URL in Twilio console
   - Ensure HTTPS is being used

2. **"HUME_API_KEY environment variable is required"**
   - Set both `HUME_API_KEY` and `HUME_SECRET_KEY` in environment variables
   - Redeploy after setting environment variables

3. **WebSocket Connection Errors**
   - Check Hume API key validity
   - Verify EVI service is available
   - Monitor CloudWatch logs for WebSocket errors

4. **SSL Certificate Issues**
   - Wait for DNS propagation before deploying
   - Certificate validation can take 5-30 minutes
   - Check Route53 hosted zone name servers

5. **Lambda Timeout**
   - Current timeout is 30 seconds
   - EVI processing includes WebSocket communication
   - Monitor CloudWatch logs for timing issues

### Debug Mode

Enable verbose logging by setting:
```bash
export DEBUG=true
```

## Cost Optimization

- Lambda: Pay per invocation (~$0.20 per million requests)
- API Gateway: ~$3.50 per million API calls
- Hume EVI: Varies by usage (speech-to-speech processing)
- Route53: ~$0.50 per hosted zone per month

## Security Features

- Twilio signature validation
- HTTPS-only communication
- AWS IAM least-privilege access
- No sensitive data logging
- Environment variable encryption

## API Reference

### Twilio Webhook Payload

The service expects Twilio webhooks with the following parameters:
- `StatusCallbackEvent`: `recording-completed`
- `RecordingUrl`: URL to download the recording
- `CallSid`: Unique call identifier

### Response Flow

1. **Audio Download**: Recording downloaded from Twilio
2. **EVI Processing**: Audio sent to Hume EVI via WebSocket
   - Real-time transcription with emotional analysis
   - Empathic understanding and response generation
   - Emotional speech synthesis
3. **Response**: JSON response with transcription, emotional analysis, and response audio

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT License - see LICENSE file for details.