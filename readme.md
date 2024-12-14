# OwnTracks Server

## Local test Deployment

```bash
npm install
npm start
```

## AWS Lambda Deployment

### Prerequisites
- AWS CLI configured
- AWS S3 bucket for Lambda deployment

### Deployment Steps
1. Build Lambda package:
```bash
npm run build:lambda
```

2. Upload to S3:
```bash
aws s3 cp lambda.zip s3://your-bucket-name/owntracks/
```

3. Deploy CloudFormation:
```bash
aws cloudformation create-stack \
  --stack-name OwnTracksServer \
  --template-body file://cloudformation.yml \
  --parameters \
    ParameterKey=LambdaCodeBucket,ParameterValue=your-bucket-name \
    ParameterKey=LambdaCodeKey,ParameterValue=owntracks/lambda.zip \
  --capabilities CAPABILITY_IAM
```

## User Management
1. Create users via AWS DynamoDB Console/CLI
2. Store with:
   - `username`: Partition Key
   - `hashed_password`: SHA-256 hex
   - `friend_group`: Group identifier

## Security Recommendations
- Use strong, unique passwords
- Rotate credentials regularly
- Implement additional security layers as needed
