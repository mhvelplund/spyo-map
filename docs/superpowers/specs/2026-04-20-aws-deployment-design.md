# AWS Deployment Design — spyo-map

**Date:** 2026-04-20
**Status:** Approved

---

## Problem Statement

The spyo-map app currently runs locally via Docker Compose (MinIO + backend + frontend). This design describes deploying it to AWS so it is publicly accessible, with infrastructure managed as code and a CI/CD pipeline that includes a post-deployment smoke test.

---

## Decisions Summary

| Question | Decision |
|---|---|
| Frontend hosting | S3 (static), served via CloudFront at `/app/*` |
| Backend hosting | ECS Fargate |
| Object storage | S3 (replaces MinIO) |
| Container registry | ECR |
| Entry point | CloudFront (single domain for frontend + API + images) |
| Custom domain | No — default CloudFront domain for now |
| Networking | Public subnets, ALB in front of ECS, SG locks backend to ALB only |
| High availability | Single AZ (single-task service — low-traffic hobby app) |
| Extractor scheduling | ECS scheduled task via EventBridge (15:00 UTC daily) |
| IaC tooling | Terragrunt + Terraform in `infra/` |
| State backend | S3 with native locking (Terraform ≥ 1.10) — no DynamoDB |
| AWS region | eu-north-1 (Stockholm) |
| CI/CD | GitHub Actions with OIDC auth (no long-lived AWS keys) |
| Environments | Single (production) |

---

## Architecture

### Overview

```
Browser
  │
  ▼
CloudFront (*.cloudfront.net)
  ├── /app/*            → S3 bucket (frontend SPA)
  ├── /api/*            → ALB → ECS Fargate backend (:3001)
  ├── /images/*         → S3 bucket (processed photos, via OAC)
  ├── /images/thumbnails/* → S3 bucket (thumbnails, via OAC)
  └── /* (default)      → S3 bucket (redirect to /app/)

S3 bucket: spyo-map
  ├── app/              ← frontend static files
  ├── images/           ← processed full-size photos (public via CF OAC)
  ├── images/thumbnails/ ← thumbnails (public via CF OAC)
  ├── raw/              ← upload source photos here (not served)
  └── images.db         ← SQLite DB (private — backend + extractor only, not exposed via CF)

ECR
  ├── spyo-map-backend
  └── spyo-map-extractor

EventBridge rule: cron(0 15 * * ? *)  → ECS RunTask (extractor)
```

CloudFront uses OAC (Origin Access Control) for all S3 origins. `images.db` is excluded from CloudFront behaviors — the backend fetches it directly from S3 using its IAM task role.

ALB access is restricted to CloudFront via a shared custom header (`X-Origin-Verify: <secret>`). The ALB listener rule forwards requests only if the header is present and matches. The secret is generated as a `random_string` resource and stored in SSM Parameter Store — both owned by the `compute` module, which injects the value into both the ALB listener rule and the CloudFront custom header config.

### Networking

- **VPC**: single VPC, public subnets in eu-north-1 (two subnets across two AZs — required by ALB).
- **ECS Fargate**: runs in public subnet with `assignPublicIp: ENABLED`. Fargate tasks reach ECR and S3 directly via public IP — no NAT Gateway needed.
- **ECS security group**: inbound port 3001 from ALB security group only; outbound 443 to anywhere.
- **ALB security group**: inbound port 80 from CloudFront managed prefix list (`com.amazonaws.global.cloudfront.origin-facing`).

---

## Components

### Backend ECS Service

| Setting | Value |
|---|---|
| Launch type | Fargate |
| Desired count | 1 |
| CPU / Memory | 256 vCPU / 512 MB |
| Health check | `GET /api/images` → 200 |
| Image | `<account>.dkr.ecr.eu-north-1.amazonaws.com/spyo-map-backend:latest` |

Environment variables (set via task definition, values from Terraform outputs):

| Variable | Value |
|---|---|
| `PORT` | `3001` |
| `STORAGE_BUCKET` | `spyo-map` |
| `STORAGE_REGION` | `eu-north-1` |
| `IMAGES_BASE_URL` | `https://<cloudfront-domain>` |
| `DB_REFRESH_INTERVAL_MS` | `300000` |
| `STORAGE_ENDPOINT` | _(unset — SDK uses native S3)_ |
| `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | _(unset — uses IAM task role)_ |

IAM task role permissions: `s3:GetObject` on `arn:aws:s3:::spyo-map/images.db` only (the backend reads only this object).

### GitHub Actions IAM Role

Created by the `iam` module. Trust policy scoped to `repo:mhvelplund/spyo-map:ref:refs/heads/main`.

Permissions:

| Action | Resource | Purpose |
|---|---|---|
| `ecr:GetAuthorizationToken` | `*` | Docker login |
| `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload` | `arn:aws:ecr:eu-north-1:<account>:repository/spyo-map-*` | Push images to ECR |
| `s3:PutObject`, `s3:DeleteObject` | `arn:aws:s3:::spyo-map/app/*` | Sync frontend dist to S3 (object operations) |
| `s3:ListBucket` (with `s3:prefix` condition on `app/`) | `arn:aws:s3:::spyo-map` | Sync frontend dist to S3 (list operation — bucket-level action) |
| `cloudfront:CreateInvalidation` | `arn:aws:cloudfront::<account>:distribution/<dist-id>` | Invalidate `/app/*` after deploy |
| `ecs:UpdateService`, `ecs:DescribeServices` | `arn:aws:ecs:eu-north-1:<account>:service/spyo-map/*` | Force new backend deployment |
| `iam:PassRole` | `arn:aws:iam::<account>:role/spyo-map-backend-task-role` | Required for `ecs:UpdateService` |

### Extractor Scheduled Task

| Setting | Value |
|---|---|
| Trigger | EventBridge rule: `cron(0 15 * * ? *)` (15:00 UTC = 16:00 GMT+1) |
| Launch type | Fargate |
| CPU / Memory | 1024 vCPU / 2048 MB (heavy image processing with `sharp`) |
| Subnet | public (eu-north-1a), `assignPublicIp: ENABLED` |
| Image | `<account>.dkr.ecr.eu-north-1.amazonaws.com/spyo-map-extractor:latest` |

Security group (dedicated, separate from backend):
- Inbound: none
- Outbound: port 443 to `0.0.0.0/0` (ECR pull, S3 read/write, CloudWatch logs)

Environment variables:

| Variable | Value |
|---|---|
| `STORAGE_BUCKET` | `spyo-map` |
| `STORAGE_REGION` | `eu-north-1` |
| `STORAGE_ENDPOINT` | _(unset — SDK uses native S3)_ |
| `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | _(unset — uses IAM task role)_ |

IAM task role permissions:
- `s3:ListBucket` with prefix condition on `raw/` (needed to enumerate source files)
- `s3:GetObject` on `raw/*`
- `s3:PutObject` on `images/*`, `images/thumbnails/*`, `images.db`
- `s3:DeleteObject` on `raw/*` (extractor deletes processed source files)

### S3 Bucket

Single bucket `spyo-map` (eu-north-1):
- **Block all public access**: enabled — CloudFront accesses it via OAC, not public URLs.
- **Versioning**: disabled (not needed — images.db is atomically replaced by the extractor).
- **Bucket policy**: allows CloudFront OAC principal `s3:GetObject` on `app/*`, `images/*`, `images/thumbnails/*`. Does **not** allow access to `images.db` or `raw/`.

### CloudFront Distribution

| Behavior | Origin | Cache policy |
|---|---|---|
| `/api/*` | ALB (HTTP — intentional; CloudFront terminates TLS, internal traffic need not be encrypted) | No cache (TTL 0) |
| `/app/*` | S3 via OAC | Managed-CachingOptimized with SPA 404→index.html custom error |
| `/images/thumbnails/*` | S3 via OAC | Managed-CachingOptimized (long TTL) |
| `/images/*` | S3 via OAC | Managed-CachingOptimized (long TTL) |
| `/*` (default) | S3 via OAC | CloudFront Function issues a `301` redirect to `/app/` |

Custom error response: HTTP 403/404 from S3 on `/app/*` → return `/app/index.html` with status 200 (enables client-side hash routing).

**Note:** CloudFront custom error responses are distribution-wide, not scoped per behavior. A 403/404 from the S3 images origin (e.g., a missing thumbnail) would also return `/app/index.html` with HTTP 200. This is acceptable: images and thumbnails are always written by the extractor before their URLs appear in `images.db`, so missing image 403s should not occur in practice. The smoke test verifies at least one image is reachable end-to-end.

---

## Infrastructure as Code

### Terragrunt + Terraform Layout

```
infra/
├── modules/
│   ├── networking/    # VPC, public subnets, SGs
│   ├── storage/       # S3 bucket + bucket policy + OAC
│   ├── ecr/           # ECR repos (backend + extractor)
│   ├── iam/           # ECS task roles, OIDC provider, GitHub Actions IAM role
│   ├── compute/       # ECS cluster + backend service + task definition + ALB
│   ├── cdn/           # CloudFront distribution + custom error responses + CF Function
│   └── scheduler/     # EventBridge rule + extractor task definition
└── live/
    ├── terragrunt.hcl              # root: remote state config (S3, eu-north-1)
    └── prod/
        ├── terragrunt.hcl          # env inputs: region, bucket name, account ID
        ├── networking/terragrunt.hcl
        ├── storage/terragrunt.hcl
        ├── ecr/terragrunt.hcl
        ├── iam/terragrunt.hcl      # no dependencies (IAM is a global service)
        ├── compute/terragrunt.hcl  # depends_on: networking, storage, iam, ecr
        ├── cdn/terragrunt.hcl      # depends_on: storage, compute
        └── scheduler/terragrunt.hcl  # depends_on: networking, compute, iam
```

Apply order managed by Terragrunt `dependency` blocks; `run-all apply` handles it automatically.

### Remote State

- **S3 bucket**: `spyo-map-tfstate-<account-id>` (eu-north-1, versioning enabled)
- **Locking**: S3 native object conditional writes (Terraform ≥ 1.10) — no DynamoDB
- **Bootstrap**: `infra/bootstrap.sh` — idempotent script that creates only the tfstate bucket (run once manually before first `terragrunt apply`)

---

## CI/CD — GitHub Actions

### Authentication

GitHub Actions authenticates to AWS via OIDC — no long-lived AWS credentials stored in GitHub. The `iam` Terraform module creates both the GitHub OIDC provider (`token.actions.githubusercontent.com`) and the trust-policy IAM role as managed resources. This means the first `terragrunt run-all apply` creates everything — no manual AWS Console or CLI steps are needed to set up OIDC. Setup is a one-time process documented in the Bootstrap Runbook below.

### GitHub Actions variables required

| Name | Description |
|---|---|
| `AWS_ACCOUNT_ID` | AWS account number |
| `AWS_REGION` | `eu-north-1` |
| `GH_ACTIONS_ROLE_ARN` | IAM role ARN (output from `iam` module after first apply) |
| `CLOUDFRONT_DOMAIN` | CloudFront domain (set after first infra apply) |
| `CLOUDFRONT_DIST_ID` | CloudFront distribution ID (set after first infra apply) |
| `ALB_DNS` | ALB DNS name (output from `compute` module — used by smoke test to verify ALB is not directly reachable) |

### Infrastructure Changes — Local Apply

Infrastructure changes (VPC, ECS, IAM, CloudFront, etc.) are applied locally using `AWS_PROFILE=spyo-map`:

```bash
cd infra/live/prod
AWS_PROFILE=spyo-map terragrunt run-all apply
```

There is no GitHub Actions workflow for infra — the GH Actions IAM role is scoped to app deployment only and does not have permissions to manage infrastructure. This is intentional: infra changes are infrequent and running them locally keeps the IAM blast radius minimal.

### Workflow — `deploy-app.yml` (on push to `main`)

Triggered on push to `main` when `packages/` changes.

Jobs (parallel where possible):

1. **`build-and-push`** — builds and pushes `backend` and `extractor` Docker images to ECR, tagged `:latest` and `:<sha>`.
2. **`build-frontend`** (parallel with `build-and-push`) — builds the frontend with `VITE_BASE_PATH=/app/` and `VITE_API_BASE_URL=""`, syncs `dist/` to `s3://spyo-map/app/`, invalidates `/app/*` in CloudFront.
3. **`deploy-backend`** (after `build-and-push`) — runs `aws ecs update-service --force-new-deployment`, then waits with `aws ecs wait services-stable`.
4. **`smoke-test`** (after `deploy-backend` + `build-frontend`) — runs `npm test --workspace=packages/smoke-test` with env vars:
   - `SMOKE_BASE_URL=https://${{ vars.CLOUDFRONT_DOMAIN }}`
   - `ALB_DNS=${{ vars.ALB_DNS }}`

---

## Post-Deployment Smoke Test

New workspace package: `packages/smoke-test`
Framework: Jest 29 + ts-jest (matches existing test setup)
Run: `SMOKE_BASE_URL=https://... ALB_DNS=... npm test --workspace=packages/smoke-test`

### Tests

1. **Frontend reachable** — `GET /app/` → HTTP 200, `text/html`, body contains `<div id="root">`.
2. **Backend API reachable** — `GET /api/images` → HTTP 200, `application/json`, response is an array.
3. **Images accessible via CloudFront** — if API returns ≥ 1 image, fetch `thumbnailUrl` → HTTP 200, `image/*`, non-empty body.
4. **ALB not directly reachable** — `GET http://<ALB_DNS>/api/images` must not succeed. The ALB security group silently drops packets (no TCP RST), so the connection will time out rather than return 403. The test must treat connection timeout and any network error (including `ECONNREFUSED`, `ETIMEDOUT`, `ECONNRESET`) as the passing condition. Only a successful HTTP 2xx response counts as a failure. A short timeout (e.g. 5 s) should be configured on the fetch to keep CI fast.

---

## Codebase Changes

### `package.json` (root)

Add `packages/smoke-test` to the `workspaces` array so `npm test` at the repo root includes it.

### `mise.toml`

Pin Terraform and Terragrunt versions so the bootstrap runbook is reproducible:

```toml
[tools]
terraform = "1.10"
terragrunt = "0.77"
```

### `packages/frontend/vite.config.ts`

One-line change: read `base` from `VITE_BASE_PATH` env var.

```diff
- base: './',
+ base: process.env.VITE_BASE_PATH ?? './',
```

Local Docker builds remain unchanged (`VITE_BASE_PATH` unset → defaults to `'./'`). The GitHub Actions workflow sets `VITE_BASE_PATH=/app/` for AWS builds.

### `packages/extractor/src/storage.ts`

Two changes required for AWS compatibility:

**1. `forcePathStyle` must be conditional** (only when `STORAGE_ENDPOINT` is set, matching the backend pattern). AWS S3 in eu-north-1 does not support path-style addressing; setting it unconditionally breaks S3 operations.

```diff
  return new S3Client({
    region: config.storageRegion,
    endpoint: config.storageEndpoint ?? undefined,
-   forcePathStyle: true,
+   ...(config.storageEndpoint ? { forcePathStyle: true } : {}),
    credentials: {
```

**2. Credentials must be optional** so the IAM task role is used in AWS. Currently `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY` are required env vars (`requireEnv`). They need to be optional; when absent the SDK falls back to the ECS task role credential chain.

```diff
- credentials: {
-   accessKeyId: config.storageAccessKey,
-   secretAccessKey: config.storageSecretKey,
- },
+ ...(config.storageAccessKey && config.storageSecretKey
+   ? { credentials: { accessKeyId: config.storageAccessKey, secretAccessKey: config.storageSecretKey } }
+   : {}),
```

`config.ts` must be updated to make both vars optional (`string | undefined`) using `process.env['STORAGE_ACCESS_KEY']` without `requireEnv`.

### `packages/backend/src/services/database.ts`

The backend `forcePathStyle` is already conditional (correct). However, the credentials block is always passed to `S3Client` even when `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY` are empty strings — this prevents the SDK from falling back to the ECS task role. Apply the same conditional credentials pattern:

```diff
  return new S3Client({
    region: config.storage.region,
-   credentials: {
-     accessKeyId: config.storage.accessKey,
-     secretAccessKey: config.storage.secretKey,
-   },
+   ...(config.storage.accessKey && config.storage.secretKey
+     ? { credentials: { accessKeyId: config.storage.accessKey, secretAccessKey: config.storage.secretKey } }
+     : {}),
    ...(config.storage.endpoint
      ? { endpoint: config.storage.endpoint, forcePathStyle: true }
      : {}),
  });
```

`packages/backend/src/config.ts` already reads both vars with `?? ""` (optional) — no change needed there.

---

## Bootstrap Runbook

The canonical bootstrap steps are defined here. `docs/runbooks/aws-bootstrap.md` contains the same content for easier reference during setup.

### Prerequisites

1. Install: AWS CLI v2, Terraform ≥ 1.10, Terragrunt, mise (use `mise install` from repo root after updating `mise.toml`)
2. Configure AWS CLI with an admin-level profile: `aws configure --profile spyo-map`
3. Verify access: `aws sts get-caller-identity --profile spyo-map`

### Step 1 — Bootstrap tfstate bucket

```bash
AWS_PROFILE=spyo-map infra/bootstrap.sh
```

This creates `spyo-map-tfstate-<account-id>` with versioning enabled. Idempotent — safe to re-run. The script body:

```bash
#!/usr/bin/env bash
set -euo pipefail
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET="spyo-map-tfstate-${ACCOUNT_ID}"
REGION="eu-north-1"

aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION" 2>/dev/null || true
aws s3api put-bucket-versioning --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled
echo "tfstate bucket ready: $BUCKET"
```

### Step 2 — First Terragrunt apply

```bash
cd infra/live/prod
AWS_PROFILE=spyo-map terragrunt run-all apply
```

This creates all resources including the GitHub OIDC provider and IAM role (both managed by the `iam` module). The trust policy is scoped to `repo:mhvelplund/spyo-map:ref:refs/heads/main`.

### Step 3 — Set GitHub Actions variables

After apply completes, capture Terraform outputs and push them as GitHub Actions repository variables (**Settings → Secrets and variables → Actions → Variables**). Using the GitHub CLI (requires `gh auth login`):

```bash
cd infra/live/prod

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
GH_ACTIONS_ROLE_ARN=$(cd iam && terragrunt output -raw github_actions_role_arn)
ALB_DNS=$(cd compute && terragrunt output -raw alb_dns_name)
CLOUDFRONT_DOMAIN=$(cd cdn && terragrunt output -raw cloudfront_domain)
CLOUDFRONT_DIST_ID=$(cd cdn && terragrunt output -raw cloudfront_distribution_id)

gh variable set AWS_ACCOUNT_ID    --body "$AWS_ACCOUNT_ID"      --repo mhvelplund/spyo-map
gh variable set AWS_REGION        --body "eu-north-1"            --repo mhvelplund/spyo-map
gh variable set GH_ACTIONS_ROLE_ARN --body "$GH_ACTIONS_ROLE_ARN" --repo mhvelplund/spyo-map
gh variable set ALB_DNS           --body "$ALB_DNS"              --repo mhvelplund/spyo-map
gh variable set CLOUDFRONT_DOMAIN --body "$CLOUDFRONT_DOMAIN"   --repo mhvelplund/spyo-map
gh variable set CLOUDFRONT_DIST_ID --body "$CLOUDFRONT_DIST_ID" --repo mhvelplund/spyo-map
```

Alternatively, set them manually in the GitHub UI using the values printed by the `terragrunt output` commands above.

### Step 4 — Verify

Trigger `deploy-app.yml` manually from the GitHub Actions tab. The smoke test job at the end confirms the deployment is healthy.

---

## Smoke Test Failure Policy

If the smoke test fails in CI, the deployment is considered unhealthy. **No automatic rollback** is performed — this is a hobby app and rollback complexity is not warranted. On failure: investigate CloudWatch logs, fix the issue, and re-deploy via `deploy-app.yml`.

---

## Out of Scope

- Custom domain / ACM certificate (can be added later)
- Multi-AZ / auto-scaling
- WAF in front of CloudFront
- Staging environment
- Extractor triggered on S3 upload (EventBridge S3 event) — currently schedule only
