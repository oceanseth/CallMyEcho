#!/bin/bash

# CallMyEcho Deployment Script
# This script automates the deployment of the CallMyEcho service

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN_NAME="${DOMAIN_NAME:-callmyecho.com}"
ENVIRONMENT="${ENVIRONMENT:-prod}"
REGION="${AWS_REGION:-us-east-1}"

echo -e "${BLUE}🚀 CallMyEcho Deployment Script${NC}"
echo -e "${BLUE}================================${NC}"
echo "Domain: $DOMAIN_NAME"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo ""

# Check prerequisites
echo -e "${YELLOW}📋 Checking prerequisites...${NC}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI is not installed. Please install it first.${NC}"
    exit 1
fi

# Check if Serverless Framework is installed
if ! command -v serverless &> /dev/null; then
    echo -e "${RED}❌ Serverless Framework is not installed. Installing...${NC}"
    npm install -g serverless
fi

# Check if Node.js version is correct
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}❌ Node.js 20.x or higher is required. Current version: $(node --version)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Check environment variables
echo -e "${YELLOW}🔧 Checking environment variables...${NC}"

if [ -z "$HUME_API_KEY" ]; then
    echo -e "${RED}❌ HUME_API_KEY is not set${NC}"
    echo "Please set your Hume AI API key:"
    echo "export HUME_API_KEY=your_api_key"
    exit 1
fi

if [ -z "$HUME_SECRET_KEY" ]; then
    echo -e "${RED}❌ HUME_SECRET_KEY is not set${NC}"
    echo "Please set your Hume AI secret key:"
    echo "export HUME_SECRET_KEY=your_secret_key"
    exit 1
fi

if [ -z "$TWILIO_AUTH_TOKEN" ]; then
    echo -e "${RED}❌ TWILIO_AUTH_TOKEN is not set${NC}"
    echo "Please set your Twilio auth token:"
    echo "export TWILIO_AUTH_TOKEN=your_auth_token"
    exit 1
fi

if [ -z "$TWILIO_ACCOUNT_SID" ]; then
    echo -e "${RED}❌ TWILIO_ACCOUNT_SID is not set${NC}"
    echo "Please set your Twilio account SID:"
    echo "export TWILIO_ACCOUNT_SID=your_account_sid"
    exit 1
fi

echo -e "${GREEN}✅ Environment variables check passed${NC}"
echo ""

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install

# Deploy Route53 infrastructure (if it doesn't exist)
STACK_NAME="callmyecho-route53-$ENVIRONMENT"
echo -e "${YELLOW}🌐 Checking Route53 infrastructure...${NC}"

if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Route53 stack already exists${NC}"
else
    echo -e "${YELLOW}🚀 Deploying Route53 infrastructure...${NC}"
    aws cloudformation deploy \
        --template-file cloudformation/route53.yml \
        --stack-name "$STACK_NAME" \
        --parameter-overrides "DomainName=$DOMAIN_NAME" "Environment=$ENVIRONMENT" \
        --capabilities CAPABILITY_IAM \
        --region "$REGION"

    echo -e "${GREEN}✅ Route53 infrastructure deployed${NC}"
    echo -e "${YELLOW}⚠️  IMPORTANT: Update your domain's name servers to:${NC}"

    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`HostedZoneNameServers`].OutputValue' \
        --output text

    echo ""
    echo -e "${YELLOW}⚠️  Wait for DNS propagation before continuing (can take up to 48 hours)${NC}"
    echo -e "${YELLOW}⚠️  SSL certificate validation will happen automatically${NC}"
    echo ""

    read -p "Press Enter once DNS has propagated and you're ready to continue..."
fi

# Create custom domain (if it doesn't exist)
echo -e "${YELLOW}🔧 Setting up custom domain...${NC}"
if serverless info --stage "$ENVIRONMENT" 2>/dev/null | grep -q "customDomain"; then
    echo -e "${GREEN}✅ Custom domain already configured${NC}"
else
    echo -e "${YELLOW}🌐 Creating custom domain...${NC}"
    serverless create_domain --stage "$ENVIRONMENT"
    echo -e "${GREEN}✅ Custom domain created${NC}"
fi

# Deploy the application
echo -e "${YELLOW}🚀 Deploying application...${NC}"
serverless deploy --stage "$ENVIRONMENT" --verbose

# Get deployment information
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
echo -e "${BLUE}📋 Deployment Information:${NC}"
echo -e "${BLUE}=========================${NC}"

# Get the API Gateway URL
API_URL=$(serverless info --stage "$ENVIRONMENT" | grep "endpoints:" -A 1 | tail -1 | awk '{print $2}')
CUSTOM_DOMAIN_URL="https://$ENVIRONMENT.$DOMAIN_NAME"

echo "Environment: $ENVIRONMENT"
echo "API Gateway URL: $API_URL"
echo "Custom Domain URL: $CUSTOM_DOMAIN_URL"
echo "Webhook URL: $CUSTOM_DOMAIN_URL/webhook/twilio"
echo ""

echo -e "${BLUE}🔧 Twilio Configuration:${NC}"
echo "================================"
echo "1. Go to your Twilio Console"
echo "2. Navigate to Phone Numbers → Manage → Active numbers"
echo "3. Click on your phone number"
echo "4. In the Voice section, set:"
echo "   - Webhook URL: $CUSTOM_DOMAIN_URL/webhook/twilio"
echo "   - HTTP Method: POST"
echo "   - Record Calls: True"
echo ""
echo "5. Go to Voice → Configure → General Settings"
echo "6. Set Recording Status Callback URL: $CUSTOM_DOMAIN_URL/webhook/twilio"
echo "7. Enable Status Callback Events: recording-completed"
echo ""

echo -e "${BLUE}🔍 Monitoring:${NC}"
echo "=============="
echo "CloudWatch Logs: aws logs tail /aws/lambda/callmyecho-$ENVIRONMENT-twilioWebhook --follow"
echo "Health Check: $CUSTOM_DOMAIN_URL/health"
echo "Serverless logs: serverless logs -f twilioWebhook --stage $ENVIRONMENT --tail"
echo ""

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${GREEN}Your CallMyEcho service is now ready to receive calls.${NC}"