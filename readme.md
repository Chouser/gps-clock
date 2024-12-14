# OwnTracks Server

## Local test

```bash
npm install
PORT=8888 npm start
```

### Using curl with basic auth
```bash
curl -v -u testuser:hello \
  -H "Content-Type: application/json" \
  -d '{"_type":"location","lat":40.7128,"lon":-74.0060}' \
  http://localhost:8888/pub
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
aws s3 cp lambda.zip s3://your-bucket-name/
```

3. Deploy CloudFormation:
```bash
aws cloudformation create-stack \
  --stack-name OwnTracksServer \
  --template-body file://cloudformation.yml \
  --parameters \
    ParameterKey=LambdaCodeBucket,ParameterValue=your-bucket-name \
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
