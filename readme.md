# OwnTracks Server

You'll need to set GOOGLE_API_KEY (could put it in env.sh)

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

## Interacting with Dynamo

Freshen up the local temp credentials:
```bash
aws sts get-session-token --duration-seconds 3600 | jq -r '.Credentials | "[default]\naws_access_key_id=\(.AccessKeyId)\naws_secret_access_key=\(.SecretAccessKey)\naws_session_token=\(.SessionToken)"' > ~/.aws/credentials
```

### Create a new user

This will create a new user named `ch` in friend-group `friends`:

```bash
AWS_REGION=us-east-2 AWS_PROFILE=default PORT=8888 npm run dynamo-ops create-user ch friends
```

Whatever password is used in the next location update will be accepted and stored.

### Local test with DynamoDB

```bash
AWS_REGION=us-east-2 AWS_PROFILE=default DYNAMO_MODE=true PORT=8888 npm start
```

## AWS Lambda Deployment

### Prerequisites
- AWS CLI configured
- AWS S3 bucket for Lambda deployment

### Deployment Steps

```bash
S3BUCKET=your-bucket-name ./deploy.sh
```

Copyright 2024 Chris Houser
