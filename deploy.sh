#!/usr/bin/env bash
set -euo pipefail

for name in S3BUCKET GOOGLE_API_KEY DOMAIN_WILDCARD DOMAIN_NAME CLOCK_CONFIG; do
    if [ -z "${!name:-}" ]; then
        echo "Error: $name is not set. Export it or source env.sh before deploying." >&2
        exit 1
    fi
done
CLOCK_CONFIG=$(jq -ce . <<< "$CLOCK_CONFIG")

npm run build:lambda
S3KEY="lambda-$(date -Iseconds)-$(sha256sum lambda.zip | cut -c1-10).zip"
aws s3 cp lambda.zip "s3://$S3BUCKET/$S3KEY"

aws cloudformation deploy \
  --stack-name OwnTracksServer \
  --template-file cloudformation.yaml \
  --parameter-overrides \
    GoogleApiKey="$GOOGLE_API_KEY" \
    LambdaCodeBucket="$S3BUCKET" \
    LambdaCodeKey="$S3KEY" \
    DomainWildcard="$DOMAIN_WILDCARD" \
    DomainName="$DOMAIN_NAME" \
    ClockConfig="$CLOCK_CONFIG" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset

echo "Deployment complete. Stack outputs:"
aws cloudformation describe-stacks --stack-name OwnTracksServer --query 'Stacks[0].Outputs' --output table
