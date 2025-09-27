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

# Check and create SSM parameters
echo -e "${YELLOW}🔧 Checking SSM parameters...${NC}"

# Function to create SSM parameter if it doesn't exist
create_ssm_parameter() {
    local param_name=$1
    local param_value=$2
    local param_description=$3

    if aws ssm get-parameter --name "$param_name" --region "$REGION" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Parameter $param_name already exists${NC}"
    else
        echo -e "${YELLOW}🔧 Creating SSM parameter: $param_name${NC}"
        aws ssm put-parameter \
            --name "$param_name" \
            --value "$param_value" \
            --type "SecureString" \
            --description "$param_description" \
            --region "$REGION"
        echo -e "${GREEN}✅ Created parameter: $param_name${NC}"
    fi
}

# Check if .env file exists and load values
if [ -f ".env" ]; then
    echo -e "${YELLOW}📋 Loading values from .env file...${NC}"
    source .env

    # Create SSM parameters
    create_ssm_parameter "/callmyecho/$ENVIRONMENT/hume-api-key" "$HUME_API_KEY" "Hume AI API Key for CallMyEcho"
    create_ssm_parameter "/callmyecho/$ENVIRONMENT/hume-secret-key" "$HUME_SECRET_KEY" "Hume AI Secret Key for CallMyEcho"
    create_ssm_parameter "/callmyecho/$ENVIRONMENT/twilio-auth-token" "$TWILIO_AUTH_TOKEN" "Twilio Auth Token for CallMyEcho"
    create_ssm_parameter "/callmyecho/$ENVIRONMENT/twilio-account-sid" "$TWILIO_ACCOUNT_SID" "Twilio Account SID for CallMyEcho"

    echo -e "${GREEN}✅ SSM parameters configured${NC}"
else
    echo -e "${RED}❌ .env file not found${NC}"
    echo "Please create a .env file with your API keys, or set the SSM parameters manually:"
    echo ""
    echo "aws ssm put-parameter --name '/callmyecho/$ENVIRONMENT/HUME_API_KEY' --value 'your_key' --type SecureString"
    echo "aws ssm put-parameter --name '/callmyecho/$ENVIRONMENT/HUME_SECRET_KEY' --value 'your_secret' --type SecureString"
    echo "aws ssm put-parameter --name '/callmyecho/$ENVIRONMENT/TWILIO_AUTH_TOKEN' --value 'your_token' --type SecureString"
    echo "aws ssm put-parameter --name '/callmyecho/$ENVIRONMENT/TWILIO_ACCOUNT_SID' --value 'your_sid' --type SecureString"
    exit 1
fi

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