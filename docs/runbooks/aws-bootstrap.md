# AWS Bootstrap Runbook

> **One-time setup.** After completing this runbook, all future deployments run automatically via GitHub Actions on every push to `main`.

## Prerequisites

- AWS CLI v2 installed and configured
- An AWS account with AdministratorAccess (for initial setup)
- Docker installed (for building images)
- Mise installed (`mise` CLI in PATH)
- Node.js 22+ (via mise: `mise install`)
- Terraform 1.10+ and Terragrunt 0.77+ (via mise: `mise install`)

## Step 0: AWS Profile Setup

Configure a named AWS profile:

```bash
aws configure --profile spyo-map
# Enter: Access Key ID, Secret Access Key, region=eu-north-1, output=json
export AWS_PROFILE=spyo-map
```

## Step 1: Create Terraform State Bucket

The state bucket must exist before Terragrunt can store state. Run the bootstrap script:

```bash
export TF_STATE_BUCKET=spyo-map-tf-state
export TF_STATE_REGION=eu-north-1
bash infra/bootstrap.sh
```

After the bucket is created, update `infra/live/terragrunt.hcl` if you used a different bucket name:
```hcl
config = {
  bucket = "your-actual-bucket-name"
  ...
}
```

## Step 2: First Terraform Apply (Pass 1)

Apply all modules except cdn (which needs the CloudFront domain output from compute):

```bash
cd infra/live

# Apply foundational modules (order matters for dependencies)
terragrunt run-all apply --terragrunt-include-dir networking
terragrunt run-all apply --terragrunt-include-dir storage
terragrunt run-all apply --terragrunt-include-dir ecr
terragrunt run-all apply --terragrunt-include-dir iam
terragrunt run-all apply --terragrunt-include-dir compute
```

Note: `compute` will have an empty `IMAGES_BASE_URL` on first apply — this is expected and resolved in Pass 2.

## Step 3: Apply CDN Module

```bash
terragrunt run-all apply --terragrunt-include-dir cdn
```

## Step 4: Update cloudfront_domain and Re-apply Compute

Get the CloudFront domain from the cdn output:

```bash
cd infra/live/cdn
terragrunt output cloudfront_domain
# Example output: d1234abcd.cloudfront.net
```

Update `infra/live/terragrunt.hcl`:
```hcl
locals {
  ...
  cloudfront_domain = "d1234abcd.cloudfront.net"  # ← paste actual value here
}
```

Re-apply compute to update the ECS task definition with the correct `IMAGES_BASE_URL`:

```bash
cd infra/live
terragrunt run-all apply --terragrunt-include-dir compute
```

## Step 5: Apply Scheduler Module

```bash
terragrunt run-all apply --terragrunt-include-dir scheduler
```

## Step 6: GitHub Actions OIDC Setup

The OIDC provider was created by the `iam` Terraform module in Step 2. Now configure the GitHub repository:

### Get required values from Terraform outputs:

```bash
cd infra/live/iam
terragrunt output github_actions_role_arn
# Example: arn:aws:iam::123456789012:role/spyo-map-github-actions

cd infra/live/compute
terragrunt output alb_dns_name
# Example: spyo-map-alb-1234567890.eu-north-1.elb.amazonaws.com

cd infra/live/cdn
terragrunt output cloudfront_domain
terragrunt output cloudfront_distribution_id
```

### Set GitHub Actions variables

Go to your repository → Settings → Secrets and variables → Actions → Variables tab.
Add the following **variables** (not secrets):

| Variable | Value |
|----------|-------|
| `AWS_ROLE_ARN` | ARN from `github_actions_role_arn` output |
| `S3_BUCKET_NAME` | `spyo-map-images` |
| `CLOUDFRONT_DISTRIBUTION_ID` | Distribution ID from cdn output |
| `CLOUDFRONT_URL` | `https://<cloudfront_domain>` |
| `ALB_DNS` | ALB DNS name from compute output |

## Step 7: Build and Push Initial Docker Images

Before GitHub Actions can deploy, initial images must exist in ECR:

```bash
# Get ECR registry URL
cd infra/live/ecr
BACKEND_REPO=$(terragrunt output -raw backend_repo_url)
EXTRACTOR_REPO=$(terragrunt output -raw extractor_repo_url)

# Authenticate Docker to ECR
aws ecr get-login-password --region eu-north-1 | \
  docker login --username AWS --password-stdin \
  $(echo $BACKEND_REPO | cut -d/ -f1)

# Build and push backend
docker build -t $BACKEND_REPO:latest -f packages/backend/Dockerfile .
docker push $BACKEND_REPO:latest

# Build and push extractor
docker build -t $EXTRACTOR_REPO:latest -f packages/extractor/Dockerfile .
docker push $EXTRACTOR_REPO:latest
```

## Step 8: Deploy Frontend

```bash
VITE_BASE_PATH=/app/ VITE_API_BASE_URL=/api npm run build
aws s3 sync packages/frontend/dist/ s3://spyo-map-images/app/ --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html"
aws s3 cp packages/frontend/dist/index.html s3://spyo-map-images/app/index.html \
  --cache-control "no-cache,no-store,must-revalidate"
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/app/*"
```

## Step 9: Run Smoke Tests

```bash
export SMOKE_BASE_URL=https://<cloudfront_domain>
export ALB_DNS=<alb_dns_name>
npm test --workspace=packages/smoke-test
```

All 4 tests should pass. If they don't, check:
- ECS service is running (`aws ecs describe-services --cluster spyo-map --services spyo-map-backend`)
- Backend logs (`aws logs tail /ecs/spyo-map-backend --follow`)
- CloudFront distribution is deployed (status "Deployed" in AWS Console)

## Step 10: Verify End-to-End

Open `https://<cloudfront_domain>/` in a browser. You should be redirected to `/app/` and see the map.

---

## Teardown

> ⚠️ **Warning:** This will permanently delete all images and data.

```bash
cd infra/live

# Remove prevent_destroy from storage/main.tf first, then:
terragrunt run-all destroy
```

Destroy order (Terragrunt handles dependencies automatically with `run-all destroy`).
