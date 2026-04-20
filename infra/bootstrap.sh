#!/usr/bin/env bash
set -euo pipefail

# Bootstrap the S3 bucket used for Terraform state.
# Run once before any `terragrunt run-all apply`.
# Requires AWS_PROFILE=spyo-map or equivalent credentials.

BUCKET_NAME="${TF_STATE_BUCKET:?TF_STATE_BUCKET must be set}"
REGION="${TF_STATE_REGION:-eu-north-1}"

echo "Creating Terraform state bucket: $BUCKET_NAME in $REGION"

aws s3api create-bucket \
  --bucket "$BUCKET_NAME" \
  --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION"

aws s3api put-bucket-versioning \
  --bucket "$BUCKET_NAME" \
  --versioning-configuration Status=Enabled

aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "State bucket ready: s3://$BUCKET_NAME"
echo "Set in infra/live/terragrunt.hcl: remote_state.config.bucket = \"$BUCKET_NAME\""
