#!/usr/bin/env bash
set -ex

npm run build:lambda
S3KEY="lambda-$(date -Iseconds)-$(sha256sum lambda.zip | cut -c1-10).zip"
op plugin run -- aws s3 cp lambda.zip "s3://$S3BUCKET/$S3KEY"

op plugin run -- aws cloudformation update-stack \
  --stack-name OwnTracksServer \
  --template-body file://cloudformation.yaml \
  --capabilities CAPABILITY_IAM \
  --parameters \
    ParameterKey=LambdaCodeBucket,ParameterValue="$S3BUCKET" \
    ParameterKey=LambdaCodeKey,ParameterValue="$S3KEY"