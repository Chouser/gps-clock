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

## Parts list

Most of these parts can be substituded with a similar alternative. Amazon links are only provided for convenience, not as strong recommendations.

1. one raspberry pi pico 2 w ($6)
2. one [usb port](https://www.amazon.com/dp/B07X86YFFN) for power ($6)
3. one [button](https://www.amazon.com/dp/B0BR41KCDP) for calibrating the hands ($6)
4. for each clock hand a [stepper motor with driver board](https://www.amazon.com/dp/B01CP18J4A) ($15)
5. [lots of female-to-female breadboard jumper wires](https://www.amazon.com//dp/B0B2L66ZFM), roughly 6 per hand plus 4, so 35 should be enough ($5)
6. to mount the motors to the hub, "6-32 x 1/2inch" machine screw and matching nut times 2 for each hand (for five hands, 10 screws and 10 nuts) ($2 at local hardware store)
7. to mount the driver boards to the box, "#6 x 1/2inch" flat head wood screws times 4 ($1 at local hardware store)

Also requires a bit of soldering, 3d printed parts (I used PETG), and laser-cut parts (5mm plywood for the box, [1.5mm basswood](https://www.amazon.com/dp/B0CKKSLZ2C) for the hands).

That comes to about $40 assuming you already have the wood, plastic, tools, solder, etc.

Hosting the server on AWS looks like it's costing about $0.05/month.


Copyright 2024 Chris Houser
