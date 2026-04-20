# AWS Deployment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy spyo-map to AWS with ECS Fargate backend, S3+CloudFront for frontend/images, Terragrunt+Terraform IaC, GitHub Actions CI/CD, and a Jest smoke test.

**Architecture:** CloudFront is the single entry point routing `/api/*` to an ALB→ECS Fargate backend, `/app/*` and `/images/*` to S3 via OAC, and `/*` via a 301 redirect CloudFront Function. The backend and extractor authenticate to S3 using IAM task roles (no static credentials). Infrastructure is applied locally with `AWS_PROFILE=spyo-map`; only app deployments (image push, S3 sync, ECS update) run in GitHub Actions via OIDC.

**Tech Stack:** TypeScript/Jest (smoke test), Terraform ≥ 1.10, Terragrunt 0.77, AWS provider `~> 5.0`, Random provider `~> 3.0`, AWS (ECS Fargate, S3, CloudFront, ALB, ECR, IAM, EventBridge Scheduler, SSM, CloudWatch).

**Spec:** `docs/superpowers/specs/2026-04-20-aws-deployment-design.md`

---

## File Map

### New files
- `packages/smoke-test/package.json`
- `packages/smoke-test/tsconfig.json`
- `packages/smoke-test/jest.config.mjs`
- `packages/smoke-test/tests/smoke.test.ts`
- `infra/bootstrap.sh`
- `infra/modules/networking/main.tf` — VPC, subnets, IGW, route table, ALB/ECS/extractor SGs
- `infra/modules/networking/variables.tf`
- `infra/modules/networking/outputs.tf`
- `infra/modules/storage/main.tf` — S3 bucket, OAC, public access block
- `infra/modules/storage/variables.tf`
- `infra/modules/storage/outputs.tf`
- `infra/modules/ecr/main.tf` — ECR repos (backend + extractor) + lifecycle policies
- `infra/modules/ecr/variables.tf`
- `infra/modules/ecr/outputs.tf`
- `infra/modules/iam/main.tf` — GitHub OIDC provider, ECS execution role, backend/extractor/GH Actions task roles
- `infra/modules/iam/variables.tf`
- `infra/modules/iam/outputs.tf`
- `infra/modules/compute/main.tf` — ECS cluster/service/task def, ALB + listener, X-Origin-Verify secret, CloudWatch log group
- `infra/modules/compute/variables.tf`
- `infra/modules/compute/outputs.tf`
- `infra/modules/cdn/main.tf` — CloudFront distribution, CF Function, S3 bucket policy
- `infra/modules/cdn/variables.tf`
- `infra/modules/cdn/outputs.tf`
- `infra/modules/scheduler/main.tf` — EventBridge Scheduler, extractor task def, CloudWatch log group, EventBridge IAM role
- `infra/modules/scheduler/variables.tf`
- `infra/modules/scheduler/outputs.tf`
- `infra/live/terragrunt.hcl` — remote state, provider generation, common locals
- `infra/live/prod/networking/terragrunt.hcl`
- `infra/live/prod/storage/terragrunt.hcl`
- `infra/live/prod/ecr/terragrunt.hcl`
- `infra/live/prod/iam/terragrunt.hcl`
- `infra/live/prod/compute/terragrunt.hcl`
- `infra/live/prod/cdn/terragrunt.hcl`
- `infra/live/prod/scheduler/terragrunt.hcl`
- `.github/workflows/deploy-app.yml`
- `docs/runbooks/aws-bootstrap.md`

### Modified files
- `mise.toml` — add `terraform = "1.10"`, `terragrunt = "0.77"`
- `packages/extractor/src/config.ts` — make `storageAccessKey`/`storageSecretKey` optional (`string | undefined`)
- `packages/extractor/src/storage.ts` — conditional `forcePathStyle` and conditional credentials block
- `packages/backend/src/services/database.ts` — conditional credentials block in `buildS3Client`
- `packages/frontend/vite.config.ts` — `base: process.env.VITE_BASE_PATH ?? './'`

Note: `package.json` root already has `"workspaces": ["packages/*"]` which covers `packages/smoke-test` automatically — no root `package.json` changes needed.

---

## Chunk 1: App Code Changes + Smoke Test

### Task 1: Add Terraform and Terragrunt to mise.toml

**Files:**
- Modify: `mise.toml`

- [ ] **Step 1: Add version pins**

In `mise.toml`, add two entries under `[tools]`:

```toml
[tools]
node = "lts"
pre-commit = "latest"
terraform = "1.10"
terragrunt = "0.77"

[shell_alias]
dc = "docker compose"
```

- [ ] **Step 2: Commit**

```bash
git add mise.toml
git commit -m "chore: pin terraform 1.10 and terragrunt 0.77 in mise.toml"
```

---

### Task 2: Fix extractor config.ts — make storage credentials optional

The extractor currently requires `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY` via `requireEnv`. In AWS, these are absent and the ECS task role is used instead.

**Files:**
- Modify: `packages/extractor/src/config.ts`

- [ ] **Step 1: Update the Config interface and loadConfig**

Replace the entire file content:

```typescript
export interface Config {
  storageEndpoint: string | undefined;
  storageBucket: string;
  storageAccessKey: string | undefined;
  storageSecretKey: string | undefined;
  storageRegion: string;
  localSourcePath: string | undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    storageEndpoint: process.env['STORAGE_ENDPOINT'] || undefined,
    storageBucket: requireEnv('STORAGE_BUCKET'),
    storageAccessKey: process.env['STORAGE_ACCESS_KEY'] || undefined,
    storageSecretKey: process.env['STORAGE_SECRET_KEY'] || undefined,
    storageRegion: process.env['STORAGE_REGION'] ?? 'us-east-1',
    localSourcePath: process.env['LOCAL_SOURCE_PATH'] || undefined,
  };
}
```

- [ ] **Step 2: Run extractor tests to confirm no regressions**

```bash
npm test --workspace=packages/extractor
```

Expected: all tests pass. (Existing tests mock S3Client and do not call `loadConfig`, so this change is safe.)

- [ ] **Step 3: Commit**

```bash
git add packages/extractor/src/config.ts
git commit -m "feat: make extractor storage credentials optional for IAM task role"
```

---

### Task 3: Fix extractor storage.ts — conditional forcePathStyle and credentials

**Files:**
- Modify: `packages/extractor/src/storage.ts`

- [ ] **Step 1: Update createS3Client**

Change the `createS3Client` function (lines 19–29) from:

```typescript
export function createS3Client(config: Config): S3Client {
  return new S3Client({
    region: config.storageRegion,
    endpoint: config.storageEndpoint ?? undefined,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.storageAccessKey,
      secretAccessKey: config.storageSecretKey,
    },
  });
}
```

To:

```typescript
export function createS3Client(config: Config): S3Client {
  return new S3Client({
    region: config.storageRegion,
    endpoint: config.storageEndpoint ?? undefined,
    ...(config.storageEndpoint ? { forcePathStyle: true } : {}),
    ...(config.storageAccessKey && config.storageSecretKey
      ? { credentials: { accessKeyId: config.storageAccessKey, secretAccessKey: config.storageSecretKey } }
      : {}),
  });
}
```

- [ ] **Step 2: Run extractor tests to confirm no regressions**

```bash
npm test --workspace=packages/extractor
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/extractor/src/storage.ts
git commit -m "feat: make extractor S3 client compatible with AWS IAM task role"
```

---

### Task 4: Fix backend database.ts — conditional credentials

The backend `forcePathStyle` is already conditional (correct). The credentials block is always passed even when `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY` are empty strings, which prevents IAM task role fallback.

**Files:**
- Modify: `packages/backend/src/services/database.ts`

- [ ] **Step 1: Update buildS3Client**

Change the `buildS3Client` function (lines 13–24) from:

```typescript
function buildS3Client(): S3Client {
  return new S3Client({
    region: config.storage.region,
    credentials: {
      accessKeyId: config.storage.accessKey,
      secretAccessKey: config.storage.secretKey,
    },
    ...(config.storage.endpoint
      ? { endpoint: config.storage.endpoint, forcePathStyle: true }
      : {}),
  });
}
```

To:

```typescript
function buildS3Client(): S3Client {
  return new S3Client({
    region: config.storage.region,
    ...(config.storage.accessKey && config.storage.secretKey
      ? { credentials: { accessKeyId: config.storage.accessKey, secretAccessKey: config.storage.secretKey } }
      : {}),
    ...(config.storage.endpoint
      ? { endpoint: config.storage.endpoint, forcePathStyle: true }
      : {}),
  });
}
```

- [ ] **Step 2: Run backend tests to confirm no regressions**

```bash
npm test --workspace=packages/backend
```

Expected: all tests pass. (Backend tests use in-memory SQLite and do not test S3 operations.)

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/services/database.ts
git commit -m "feat: make backend S3 client compatible with AWS IAM task role"
```

---

### Task 5: Fix frontend vite.config.ts — VITE_BASE_PATH

**Files:**
- Modify: `packages/frontend/vite.config.ts`

- [ ] **Step 1: Make base path configurable**

In `packages/frontend/vite.config.ts`, find the line (around line 71):

```typescript
  base: './',
```

Change it to:

```typescript
  base: process.env.VITE_BASE_PATH ?? './',
```

- [ ] **Step 2: Verify local build still works**

```bash
npm run build --workspace=packages/frontend
```

Expected: build succeeds, `packages/frontend/dist/` is populated. The default `'./'` is used when `VITE_BASE_PATH` is unset.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/vite.config.ts
git commit -m "feat: make frontend base path configurable via VITE_BASE_PATH"
```

---

### Task 6: Scaffold smoke-test package

The smoke test is an integration test package that runs against a real deployment. It cannot be run locally without a deployed environment; CI runs it after `deploy-backend` and `build-frontend` succeed.

**Files:**
- Create: `packages/smoke-test/package.json`
- Create: `packages/smoke-test/tsconfig.json`
- Create: `packages/smoke-test/jest.config.mjs`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@spyro-map/smoke-test",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "test": "node --experimental-vm-modules ../../node_modules/.bin/jest"
  },
  "devDependencies": {
    "@types/jest": "^29.0.0",
    "@types/node": "^24.6.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "~5.9.3"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["tests"]
}
```

- [ ] **Step 3: Create jest.config.mjs**

```javascript
/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  testTimeout: 15000,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      isolatedModules: true,
      tsconfig: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        verbatimModuleSyntax: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
        isolatedModules: true,
      },
    }],
  },
};

export default config;
```

- [ ] **Step 4: Install workspace dependencies**

```bash
npm install
```

Expected: `packages/smoke-test/node_modules` is not created (hoisted to root). No errors.

---

### Task 7: Write smoke tests

**Files:**
- Create: `packages/smoke-test/tests/smoke.test.ts`

- [ ] **Step 1: Create tests/smoke.test.ts**

```typescript
const BASE_URL = process.env['SMOKE_BASE_URL'];
const ALB_DNS = process.env['ALB_DNS'];

if (!BASE_URL || !ALB_DNS) {
  throw new Error('SMOKE_BASE_URL and ALB_DNS environment variables must be set');
}

describe('smoke tests', () => {
  test('frontend is reachable at /app/', async () => {
    const res = await fetch(`${BASE_URL}/app/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain('<div id="root">');
  });

  test('backend API returns image list at /api/images', async () => {
    const res = await fetch(`${BASE_URL}/api/images`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const data: unknown = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('images are accessible via CloudFront', async () => {
    const apiRes = await fetch(`${BASE_URL}/api/images`);
    const images = (await apiRes.json()) as Array<{ thumbnailUrl: string }>;
    if (images.length === 0) {
      console.log('No images in DB — skipping image reachability check');
      return;
    }
    const imageRes = await fetch(images[0].thumbnailUrl);
    expect(imageRes.status).toBe(200);
    expect(imageRes.headers.get('content-type')).toMatch(/image\//);
    const buf = await imageRes.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  test('ALB is not directly reachable (bypass protection works)', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, 5000);
    try {
      const res = await fetch(`http://${ALB_DNS}/api/images`, {
        signal: controller.signal,
      });
      // A 2xx means the SG is not blocking — this is the failure case
      if (res.status >= 200 && res.status < 300) {
        throw new Error(`ALB returned HTTP ${res.status} — direct access is not blocked`);
      }
      // Non-2xx (e.g. 403 from ALB default rule) is acceptable
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return; // timeout → pass
      if (err instanceof TypeError) return; // network error (ECONNREFUSED, ECONNRESET) → pass
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  });
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/smoke-test && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/smoke-test/
git commit -m "feat: add smoke-test workspace with 4 post-deployment integration tests"
```

---

## Chunk 2: Terraform Modules — networking, storage, ecr, iam

> Each module is validated with `terraform init -backend=false && terraform validate` before committing. No AWS credentials are required for validation.

### Task 8: networking module

Provides VPC, two public subnets (required by ALB), internet gateway, route table, and three security groups.

**Files:**
- Create: `infra/modules/networking/main.tf`
- Create: `infra/modules/networking/variables.tf`
- Create: `infra/modules/networking/outputs.tf`

- [ ] **Step 1: Create variables.tf**

```hcl
variable "app_name" {
  description = "Application name used as a prefix for all resources"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}
```

- [ ] **Step 2: Create main.tf**

```hcl
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = { Name = "${var.app_name}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.app_name}-igw" }
}

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.region}a"
  map_public_ip_on_launch = true
  tags                    = { Name = "${var.app_name}-public-a" }
}

resource "aws_subnet" "public_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = "${var.region}b"
  map_public_ip_on_launch = true
  tags                    = { Name = "${var.app_name}-public-b" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${var.app_name}-public-rt" }
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "alb" {
  name        = "${var.app_name}-alb"
  description = "ALB: inbound from CloudFront only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "HTTP from CloudFront"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.app_name}-alb" }
}

resource "aws_security_group" "backend_ecs" {
  name        = "${var.app_name}-backend-ecs"
  description = "Backend ECS: inbound from ALB only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Backend port from ALB"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "HTTPS out (ECR, S3, CloudWatch)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.app_name}-backend-ecs" }
}

resource "aws_security_group" "extractor_ecs" {
  name        = "${var.app_name}-extractor-ecs"
  description = "Extractor ECS: no inbound, HTTPS out"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "HTTPS out (ECR, S3, CloudWatch)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.app_name}-extractor-ecs" }
}
```

- [ ] **Step 3: Create outputs.tf**

```hcl
output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = [aws_subnet.public_a.id, aws_subnet.public_b.id]
}

output "public_subnet_a_id" {
  value = aws_subnet.public_a.id
}

output "alb_sg_id" {
  value = aws_security_group.alb.id
}

output "backend_ecs_sg_id" {
  value = aws_security_group.backend_ecs.id
}

output "extractor_ecs_sg_id" {
  value = aws_security_group.extractor_ecs.id
}
```

- [ ] **Step 4: Validate**

```bash
cd infra/modules/networking
terraform init -backend=false
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 5: Commit**

```bash
git add infra/modules/networking/
git commit -m "feat: add networking Terraform module"
```

---

### Task 9: storage module

S3 bucket (private, all public access blocked) and CloudFront OAC. The bucket policy is created in the `cdn` module (it needs the CloudFront distribution ARN, which doesn't exist yet at this point).

**Files:**
- Create: `infra/modules/storage/main.tf`
- Create: `infra/modules/storage/variables.tf`
- Create: `infra/modules/storage/outputs.tf`

- [ ] **Step 1: Create variables.tf**

```hcl
variable "bucket_name" {
  description = "S3 bucket name"
  type        = string
}
```

- [ ] **Step 2: Create main.tf**

```hcl
resource "aws_s3_bucket" "main" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_public_access_block" "main" {
  bucket                  = aws_s3_bucket.main.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${var.bucket_name}-oac"
  description                       = "OAC for ${var.bucket_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}
```

- [ ] **Step 3: Create outputs.tf**

```hcl
output "bucket_id" {
  value = aws_s3_bucket.main.id
}

output "bucket_arn" {
  value = aws_s3_bucket.main.arn
}

output "bucket_regional_domain_name" {
  value = aws_s3_bucket.main.bucket_regional_domain_name
}

output "oac_id" {
  value = aws_cloudfront_origin_access_control.s3.id
}
```

- [ ] **Step 4: Validate**

```bash
cd infra/modules/storage
terraform init -backend=false
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 5: Commit**

```bash
git add infra/modules/storage/
git commit -m "feat: add storage Terraform module"
```

---

### Task 10: ecr module

Two ECR repositories (backend + extractor) with lifecycle policies to cap stored image count at 5.

**Files:**
- Create: `infra/modules/ecr/main.tf`
- Create: `infra/modules/ecr/variables.tf`
- Create: `infra/modules/ecr/outputs.tf`

- [ ] **Step 1: Create variables.tf**

```hcl
variable "app_name" {
  description = "Application name prefix"
  type        = string
}
```

- [ ] **Step 2: Create main.tf**

```hcl
resource "aws_ecr_repository" "backend" {
  name                 = "${var.app_name}-backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "extractor" {
  name                 = "${var.app_name}-extractor"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "extractor" {
  repository = aws_ecr_repository.extractor.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}
```

- [ ] **Step 3: Create outputs.tf**

```hcl
output "backend_repo_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "extractor_repo_url" {
  value = aws_ecr_repository.extractor.repository_url
}

output "backend_repo_arn" {
  value = aws_ecr_repository.backend.arn
}

output "extractor_repo_arn" {
  value = aws_ecr_repository.extractor.arn
}
```

- [ ] **Step 4: Validate**

```bash
cd infra/modules/ecr
terraform init -backend=false
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 5: Commit**

```bash
git add infra/modules/ecr/
git commit -m "feat: add ECR Terraform module"
```

---

### Task 11: iam module

GitHub OIDC provider, ECS task execution role, backend task role, extractor task role, and GitHub Actions deployment role.

**Files:**
- Create: `infra/modules/iam/main.tf`
- Create: `infra/modules/iam/variables.tf`
- Create: `infra/modules/iam/outputs.tf`

- [ ] **Step 1: Create variables.tf**

```hcl
variable "account_id" {
  description = "AWS account ID"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "bucket_name" {
  description = "S3 bucket name for spyo-map"
  type        = string
}

variable "backend_repo_arn" {
  description = "ARN of the backend ECR repository"
  type        = string
}

variable "extractor_repo_arn" {
  description = "ARN of the extractor ECR repository"
  type        = string
}

variable "github_repo" {
  description = "GitHub repo in owner/name format for OIDC trust"
  type        = string
  default     = "mhvelplund/spyo-map"
}
```

- [ ] **Step 2: Create main.tf**

```hcl
# GitHub OIDC provider — allows GitHub Actions to assume AWS roles without static credentials
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  # Thumbprint is not validated by AWS for GitHub — using the known public value
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# GitHub Actions deployment role
resource "aws_iam_role" "github_actions" {
  name = "spyo-map-github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:ref:refs/heads/main"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_actions" {
  name = "deploy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ECRAuth"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "ECRPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
        ]
        Resource = [var.backend_repo_arn, var.extractor_repo_arn]
      },
      {
        Sid      = "S3FrontendObjects"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::${var.bucket_name}/app/*"
      },
      {
        Sid    = "S3FrontendList"
        Effect = "Allow"
        Action = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::${var.bucket_name}"
        Condition = {
          StringLike = { "s3:prefix" = ["app/*"] }
        }
      },
      {
        Sid      = "CloudFrontInvalidate"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation"]
        # Scoped to all distributions in the account — narrowed in the runbook after first deploy
        Resource = "arn:aws:cloudfront::${var.account_id}:distribution/*"
      },
      {
        Sid    = "ECSDeployBackend"
        Effect = "Allow"
        Action = ["ecs:UpdateService", "ecs:DescribeServices"]
        Resource = "arn:aws:ecs:${var.region}:${var.account_id}:service/spyo-map/*"
      },
      {
        Sid      = "ECSPassRole"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = "arn:aws:iam::${var.account_id}:role/spyo-map-backend-task-role"
      },
    ]
  })
}

# ECS task execution role — used by ECS to pull images from ECR and write to CloudWatch
resource "aws_iam_role" "ecs_task_execution" {
  name = "spyo-map-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Backend task role — grants the running container access to images.db only
resource "aws_iam_role" "backend_task" {
  name = "spyo-map-backend-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "backend_task" {
  name = "read-images-db"
  role = aws_iam_role.backend_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject"]
      Resource = "arn:aws:s3:::${var.bucket_name}/images.db"
    }]
  })
}

# Extractor task role — reads raw/, writes images/ and images.db
resource "aws_iam_role" "extractor_task" {
  name = "spyo-map-extractor-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "extractor_task" {
  name = "process-images"
  role = aws_iam_role.extractor_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ListRaw"
        Effect = "Allow"
        Action = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::${var.bucket_name}"
        Condition = {
          StringLike = { "s3:prefix" = ["raw/*"] }
        }
      },
      {
        Sid      = "ReadRaw"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "arn:aws:s3:::${var.bucket_name}/raw/*"
      },
      {
        Sid    = "WriteOutput"
        Effect = "Allow"
        Action = ["s3:PutObject"]
        Resource = [
          "arn:aws:s3:::${var.bucket_name}/images/*",
          "arn:aws:s3:::${var.bucket_name}/images/thumbnails/*",
          "arn:aws:s3:::${var.bucket_name}/images.db",
        ]
      },
      {
        Sid      = "DeleteProcessed"
        Effect   = "Allow"
        Action   = ["s3:DeleteObject"]
        Resource = "arn:aws:s3:::${var.bucket_name}/raw/*"
      },
    ]
  })
}
```

- [ ] **Step 3: Create outputs.tf**

```hcl
output "github_actions_role_arn" {
  value = aws_iam_role.github_actions.arn
}

output "ecs_task_execution_role_arn" {
  value = aws_iam_role.ecs_task_execution.arn
}

output "backend_task_role_arn" {
  value = aws_iam_role.backend_task.arn
}

output "extractor_task_role_arn" {
  value = aws_iam_role.extractor_task.arn
}
```

- [ ] **Step 4: Validate**

```bash
cd infra/modules/iam
terraform init -backend=false
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 5: Commit**

```bash
git add infra/modules/iam/
git commit -m "feat: add IAM Terraform module (OIDC, task roles, GH Actions role)"
```

---

## Chunk 3: Terraform Modules — compute, cdn, scheduler

### Task 12: compute module

ECS cluster, backend task definition + service, ALB with X-Origin-Verify enforcement, CloudWatch log group, and X-Origin-Verify secret via SSM.

**Files:**
- Create: `infra/modules/compute/main.tf`
- Create: `infra/modules/compute/variables.tf`
- Create: `infra/modules/compute/outputs.tf`

- [ ] **Step 1: Create variables.tf**

```hcl
variable "app_name" {
  type = string
}

variable "region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "public_subnet_a_id" {
  description = "Single AZ subnet for ECS service (eu-north-1a)"
  type        = string
}

variable "alb_sg_id" {
  type = string
}

variable "backend_ecs_sg_id" {
  type = string
}

variable "ecs_task_execution_role_arn" {
  type = string
}

variable "backend_task_role_arn" {
  type = string
}

variable "backend_repo_url" {
  type = string
}

variable "bucket_name" {
  type = string
}

variable "storage_region" {
  type = string
}

variable "cloudfront_domain" {
  description = "CloudFront domain for IMAGES_BASE_URL. Empty string on first apply; update and re-apply after cdn module creates the distribution."
  type        = string
  default     = ""
}
```

- [ ] **Step 2: Create main.tf**

```hcl
resource "random_string" "origin_verify" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "origin_verify" {
  name  = "/${var.app_name}/origin-verify-secret"
  type  = "SecureString"
  value = random_string.origin_verify.result
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.app_name}-backend"
  retention_in_days = 14
}

resource "aws_lb" "main" {
  name               = "${var.app_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_sg_id]
  subnets            = var.public_subnet_ids
}

resource "aws_lb_target_group" "backend" {
  name        = "${var.app_name}-backend"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/api/images"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 10
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }
}

resource "aws_lb_listener_rule" "backend" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [random_string.origin_verify.result]
    }
  }
}

resource "aws_ecs_cluster" "main" {
  name = var.app_name
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.app_name}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = var.ecs_task_execution_role_arn
  task_role_arn            = var.backend_task_role_arn

  container_definitions = jsonencode([{
    name      = "backend"
    image     = "${var.backend_repo_url}:latest"
    essential = true
    portMappings = [{
      containerPort = 3001
      protocol      = "tcp"
    }]
    environment = [
      { name = "PORT",                   value = "3001" },
      { name = "STORAGE_BUCKET",         value = var.bucket_name },
      { name = "STORAGE_REGION",         value = var.storage_region },
      { name = "IMAGES_BASE_URL",        value = var.cloudfront_domain != "" ? "https://${var.cloudfront_domain}" : "" },
      { name = "DB_REFRESH_INTERVAL_MS", value = "300000" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = var.storage_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "backend" {
  name            = "${var.app_name}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [var.public_subnet_a_id]
    security_groups  = [var.backend_ecs_sg_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 3001
  }

  depends_on = [aws_lb_listener_rule.backend]
}
```

- [ ] **Step 3: Create outputs.tf**

```hcl
output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "ecs_cluster_arn" {
  value = aws_ecs_cluster.main.arn
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "origin_verify_secret" {
  value     = random_string.origin_verify.result
  sensitive = true
}
```

- [ ] **Step 4: Validate**

```bash
cd infra/modules/compute
terraform init -backend=false
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 5: Commit**

```bash
git add infra/modules/compute/
git commit -m "feat: add compute Terraform module (ECS, ALB, X-Origin-Verify)"
```

---

### Task 13: cdn module

CloudFront distribution, CloudFront Function for root redirect, and S3 bucket policy (cdn owns it since it holds both the bucket ARN and the distribution ARN).

**Files:**
- Create: `infra/modules/cdn/main.tf`
- Create: `infra/modules/cdn/variables.tf`
- Create: `infra/modules/cdn/outputs.tf`

- [ ] **Step 1: Create variables.tf**

```hcl
variable "bucket_id" {
  type = string
}

variable "bucket_arn" {
  type = string
}

variable "bucket_regional_domain_name" {
  type = string
}

variable "oac_id" {
  type = string
}

variable "alb_dns_name" {
  type = string
}

variable "origin_verify_secret" {
  description = "Value of X-Origin-Verify header sent from CloudFront to ALB"
  type        = string
  sensitive   = true
}
```

- [ ] **Step 2: Create main.tf**

```hcl
resource "aws_cloudfront_function" "redirect_to_app" {
  name    = "spyo-map-redirect-to-app"
  runtime = "cloudfront-js-2.0"
  comment = "Redirect bare / requests to /app/"
  publish = true
  code    = <<-EOF
    function handler(event) {
      return {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: { location: { value: '/app/' } }
      };
    }
  EOF
}

resource "aws_cloudfront_distribution" "main" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "spyo-map"

  # S3 origin (frontend, images)
  origin {
    domain_name              = var.bucket_regional_domain_name
    origin_id                = "s3"
    origin_access_control_id = var.oac_id
  }

  # ALB origin (backend API) — HTTP intentional; CloudFront terminates TLS
  origin {
    domain_name = var.alb_dns_name
    origin_id   = "alb"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
    custom_header {
      name  = "X-Origin-Verify"
      value = var.origin_verify_secret
    }
  }

  # /api/* → ALB, no caching, forward all headers except Host
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    # CachingDisabled managed policy
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    # AllViewerExceptHostHeader managed policy
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  # /app/* → S3, CachingOptimized
  ordered_cache_behavior {
    path_pattern           = "/app/*"
    target_origin_id       = "s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    # CachingOptimized managed policy
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  # /images/thumbnails/* → S3 — must come before /images/* (more specific first)
  ordered_cache_behavior {
    path_pattern           = "/images/thumbnails/*"
    target_origin_id       = "s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  # /images/* → S3
  ordered_cache_behavior {
    path_pattern           = "/images/*"
    target_origin_id       = "s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  # /* default → S3 with 301 redirect CF Function to /app/
  default_cache_behavior {
    target_origin_id       = "s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.redirect_to_app.arn
    }
  }

  # Distribution-wide: 403/404 from S3 → /app/index.html with 200
  # (enables hash-based client-side routing for the SPA)
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/app/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/app/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# S3 bucket policy — cdn owns this because it holds both the distribution ARN and bucket ARN
resource "aws_s3_bucket_policy" "main" {
  bucket = var.bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowCloudFrontOAC"
      Effect = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action   = "s3:GetObject"
      Resource = [
        "${var.bucket_arn}/app/*",
        "${var.bucket_arn}/images/*",
        "${var.bucket_arn}/images/thumbnails/*",
      ]
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
        }
      }
    }]
  })
}
```

- [ ] **Step 3: Create outputs.tf**

```hcl
output "cloudfront_domain" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.main.id
}

output "cloudfront_distribution_arn" {
  value = aws_cloudfront_distribution.main.arn
}
```

- [ ] **Step 4: Validate**

```bash
cd infra/modules/cdn
terraform init -backend=false
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 5: Commit**

```bash
git add infra/modules/cdn/
git commit -m "feat: add CDN Terraform module (CloudFront, CF Function, S3 bucket policy)"
```

---

### Task 14: scheduler module

EventBridge Scheduler for daily extractor runs (15:00 UTC), extractor task definition, CloudWatch log group, and the EventBridge IAM role.

**Files:**
- Create: `infra/modules/scheduler/main.tf`
- Create: `infra/modules/scheduler/variables.tf`
- Create: `infra/modules/scheduler/outputs.tf`

- [ ] **Step 1: Create variables.tf**

```hcl
variable "app_name" {
  type = string
}

variable "region" {
  type = string
}

variable "public_subnet_a_id" {
  type = string
}

variable "extractor_ecs_sg_id" {
  type = string
}

variable "ecs_cluster_arn" {
  type = string
}

variable "ecs_task_execution_role_arn" {
  type = string
}

variable "extractor_task_role_arn" {
  type = string
}

variable "extractor_repo_url" {
  type = string
}

variable "bucket_name" {
  type = string
}

variable "storage_region" {
  type = string
}
```

- [ ] **Step 2: Create main.tf**

```hcl
resource "aws_cloudwatch_log_group" "extractor" {
  name              = "/ecs/${var.app_name}-extractor"
  retention_in_days = 14
}

resource "aws_ecs_task_definition" "extractor" {
  family                   = "${var.app_name}-extractor"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = var.ecs_task_execution_role_arn
  task_role_arn            = var.extractor_task_role_arn

  container_definitions = jsonencode([{
    name      = "extractor"
    image     = "${var.extractor_repo_url}:latest"
    essential = true
    environment = [
      { name = "STORAGE_BUCKET", value = var.bucket_name },
      { name = "STORAGE_REGION", value = var.storage_region },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.extractor.name
        "awslogs-region"        = var.storage_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

# IAM role allowing EventBridge Scheduler to run ECS tasks
resource "aws_iam_role" "eventbridge_scheduler" {
  name = "${var.app_name}-eventbridge-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "eventbridge_scheduler" {
  name = "run-extractor"
  role = aws_iam_role.eventbridge_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecs:RunTask"]
        Resource = [aws_ecs_task_definition.extractor.arn]
      },
      {
        Effect = "Allow"
        Action = ["iam:PassRole"]
        Resource = [
          var.extractor_task_role_arn,
          var.ecs_task_execution_role_arn,
        ]
      },
    ]
  })
}

resource "aws_scheduler_schedule" "extractor_daily" {
  name       = "${var.app_name}-extractor-daily"
  group_name = "default"

  flexible_time_window {
    mode = "OFF"
  }

  # 15:00 UTC = 16:00 GMT+1
  schedule_expression          = "cron(0 15 * * ? *)"
  schedule_expression_timezone = "UTC"

  target {
    arn      = var.ecs_cluster_arn
    role_arn = aws_iam_role.eventbridge_scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.extractor.arn
      launch_type         = "FARGATE"

      network_configuration {
        subnets          = [var.public_subnet_a_id]
        security_groups  = [var.extractor_ecs_sg_id]
        assign_public_ip = true
      }
    }
  }
}
```

- [ ] **Step 3: Create outputs.tf**

```hcl
output "extractor_task_definition_arn" {
  value = aws_ecs_task_definition.extractor.arn
}

output "scheduler_schedule_arn" {
  value = aws_scheduler_schedule.extractor_daily.arn
}
```

- [ ] **Step 4: Validate**

```bash
cd infra/modules/scheduler
terraform init -backend=false
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 5: Commit**

```bash
git add infra/modules/scheduler/
git commit -m "feat: add scheduler Terraform module (EventBridge Scheduler + extractor task def)"
```

---

## Chunk 4: Terragrunt Live Config + Bootstrap + CI/CD

### Task 15: infra/bootstrap.sh

**Files:**
- Create: `infra/bootstrap.sh`

- [ ] **Step 1: Create bootstrap.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET="spyo-map-tfstate-${ACCOUNT_ID}"
REGION="eu-north-1"

echo "Creating tfstate bucket: ${BUCKET} in ${REGION}"

aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION" 2>/dev/null || true

aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'

echo "tfstate bucket ready: ${BUCKET}"
```

- [ ] **Step 2: Make executable and commit**

```bash
chmod +x infra/bootstrap.sh
git add infra/bootstrap.sh
git commit -m "feat: add idempotent bootstrap script for tfstate bucket"
```

---

### Task 16: Terragrunt root and live configs

**Files:**
- Create: `infra/live/terragrunt.hcl`
- Create: `infra/live/prod/networking/terragrunt.hcl`
- Create: `infra/live/prod/storage/terragrunt.hcl`
- Create: `infra/live/prod/ecr/terragrunt.hcl`
- Create: `infra/live/prod/iam/terragrunt.hcl`
- Create: `infra/live/prod/compute/terragrunt.hcl`
- Create: `infra/live/prod/cdn/terragrunt.hcl`
- Create: `infra/live/prod/scheduler/terragrunt.hcl`

- [ ] **Step 1: Create infra/live/terragrunt.hcl**

```hcl
locals {
  account_id = get_aws_account_id()
  region     = "eu-north-1"
  bucket_name = "spyo-map"
  app_name    = "spyo-map"

  # After the first cdn apply, set this to the CloudFront domain output, then re-apply compute.
  cloudfront_domain = ""
}

remote_state {
  backend = "s3"
  config = {
    bucket       = "spyo-map-tfstate-${local.account_id}"
    key          = "${path_relative_to_include()}/terraform.tfstate"
    region       = local.region
    encrypt      = true
    use_lockfile = true
  }
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite"
  }
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite"
  contents  = <<-EOF
    terraform {
      required_version = ">= 1.10"
      required_providers {
        aws = {
          source  = "hashicorp/aws"
          version = "~> 5.0"
        }
        random = {
          source  = "hashicorp/random"
          version = "~> 3.0"
        }
      }
    }
    provider "aws" {
      region = "${local.region}"
    }
  EOF
}
```

- [ ] **Step 2: Create prod/networking/terragrunt.hcl**

```hcl
include "root" {
  path   = find_in_parent_folders()
  expose = true
}

terraform {
  source = "${get_repo_root()}/infra/modules/networking"
}

inputs = {
  app_name = include.root.locals.app_name
  region   = include.root.locals.region
}
```

- [ ] **Step 3: Create prod/storage/terragrunt.hcl**

```hcl
include "root" {
  path   = find_in_parent_folders()
  expose = true
}

terraform {
  source = "${get_repo_root()}/infra/modules/storage"
}

inputs = {
  bucket_name = include.root.locals.bucket_name
}
```

- [ ] **Step 4: Create prod/ecr/terragrunt.hcl**

```hcl
include "root" {
  path   = find_in_parent_folders()
  expose = true
}

terraform {
  source = "${get_repo_root()}/infra/modules/ecr"
}

inputs = {
  app_name = include.root.locals.app_name
}
```

- [ ] **Step 5: Create prod/iam/terragrunt.hcl**

```hcl
include "root" {
  path   = find_in_parent_folders()
  expose = true
}

terraform {
  source = "${get_repo_root()}/infra/modules/iam"
}

inputs = {
  account_id         = include.root.locals.account_id
  region             = include.root.locals.region
  bucket_name        = include.root.locals.bucket_name
  backend_repo_arn   = "arn:aws:ecr:${include.root.locals.region}:${include.root.locals.account_id}:repository/spyo-map-backend"
  extractor_repo_arn = "arn:aws:ecr:${include.root.locals.region}:${include.root.locals.account_id}:repository/spyo-map-extractor"
}
```

- [ ] **Step 6: Create prod/compute/terragrunt.hcl**

```hcl
include "root" {
  path   = find_in_parent_folders()
  expose = true
}

terraform {
  source = "${get_repo_root()}/infra/modules/compute"
}

dependency "networking" {
  config_path = "../networking"
  mock_outputs = {
    vpc_id              = "vpc-00000000"
    public_subnet_ids   = ["subnet-00000001", "subnet-00000002"]
    public_subnet_a_id  = "subnet-00000001"
    alb_sg_id           = "sg-00000001"
    backend_ecs_sg_id   = "sg-00000002"
  }
}

dependency "iam" {
  config_path = "../iam"
  mock_outputs = {
    ecs_task_execution_role_arn = "arn:aws:iam::000000000000:role/spyo-map-ecs-task-execution"
    backend_task_role_arn       = "arn:aws:iam::000000000000:role/spyo-map-backend-task-role"
  }
}

dependency "ecr" {
  config_path = "../ecr"
  mock_outputs = {
    backend_repo_url = "000000000000.dkr.ecr.eu-north-1.amazonaws.com/spyo-map-backend"
  }
}

inputs = {
  app_name                    = include.root.locals.app_name
  region                      = include.root.locals.region
  vpc_id                      = dependency.networking.outputs.vpc_id
  public_subnet_ids           = dependency.networking.outputs.public_subnet_ids
  public_subnet_a_id          = dependency.networking.outputs.public_subnet_a_id
  alb_sg_id                   = dependency.networking.outputs.alb_sg_id
  backend_ecs_sg_id           = dependency.networking.outputs.backend_ecs_sg_id
  ecs_task_execution_role_arn = dependency.iam.outputs.ecs_task_execution_role_arn
  backend_task_role_arn       = dependency.iam.outputs.backend_task_role_arn
  backend_repo_url            = dependency.ecr.outputs.backend_repo_url
  bucket_name                 = include.root.locals.bucket_name
  storage_region              = include.root.locals.region
  cloudfront_domain           = include.root.locals.cloudfront_domain
}
```

- [ ] **Step 7: Create prod/cdn/terragrunt.hcl**

```hcl
include "root" {
  path   = find_in_parent_folders()
  expose = true
}

terraform {
  source = "${get_repo_root()}/infra/modules/cdn"
}

dependency "storage" {
  config_path = "../storage"
  mock_outputs = {
    bucket_id                   = "spyo-map"
    bucket_arn                  = "arn:aws:s3:::spyo-map"
    bucket_regional_domain_name = "spyo-map.s3.eu-north-1.amazonaws.com"
    oac_id                      = "ABCDEFGH12345"
  }
}

dependency "compute" {
  config_path = "../compute"
  mock_outputs = {
    alb_dns_name         = "spyo-map-alb-000000000.eu-north-1.elb.amazonaws.com"
    origin_verify_secret = "placeholder-secret"
  }
}

inputs = {
  bucket_id                   = dependency.storage.outputs.bucket_id
  bucket_arn                  = dependency.storage.outputs.bucket_arn
  bucket_regional_domain_name = dependency.storage.outputs.bucket_regional_domain_name
  oac_id                      = dependency.storage.outputs.oac_id
  alb_dns_name                = dependency.compute.outputs.alb_dns_name
  origin_verify_secret        = dependency.compute.outputs.origin_verify_secret
}
```

- [ ] **Step 8: Create prod/scheduler/terragrunt.hcl**

```hcl
include "root" {
  path   = find_in_parent_folders()
  expose = true
}

terraform {
  source = "${get_repo_root()}/infra/modules/scheduler"
}

dependency "networking" {
  config_path = "../networking"
  mock_outputs = {
    public_subnet_a_id  = "subnet-00000001"
    extractor_ecs_sg_id = "sg-00000003"
  }
}

dependency "compute" {
  config_path = "../compute"
  mock_outputs = {
    ecs_cluster_arn  = "arn:aws:ecs:eu-north-1:000000000000:cluster/spyo-map"
    ecs_cluster_name = "spyo-map"
  }
}

dependency "iam" {
  config_path = "../iam"
  mock_outputs = {
    ecs_task_execution_role_arn = "arn:aws:iam::000000000000:role/spyo-map-ecs-task-execution"
    extractor_task_role_arn     = "arn:aws:iam::000000000000:role/spyo-map-extractor-task-role"
  }
}

dependency "ecr" {
  config_path = "../ecr"
  mock_outputs = {
    extractor_repo_url = "000000000000.dkr.ecr.eu-north-1.amazonaws.com/spyo-map-extractor"
  }
}

inputs = {
  app_name                    = include.root.locals.app_name
  region                      = include.root.locals.region
  public_subnet_a_id          = dependency.networking.outputs.public_subnet_a_id
  extractor_ecs_sg_id         = dependency.networking.outputs.extractor_ecs_sg_id
  ecs_cluster_arn             = dependency.compute.outputs.ecs_cluster_arn
  ecs_task_execution_role_arn = dependency.iam.outputs.ecs_task_execution_role_arn
  extractor_task_role_arn     = dependency.iam.outputs.extractor_task_role_arn
  extractor_repo_url          = dependency.ecr.outputs.extractor_repo_url
  bucket_name                 = include.root.locals.bucket_name
  storage_region              = include.root.locals.region
}
```

- [ ] **Step 9: Commit all Terragrunt live configs**

```bash
git add infra/live/
git commit -m "feat: add Terragrunt live config for all prod modules"
```

---

### Task 17: GitHub Actions deploy-app workflow

**Files:**
- Create: `.github/workflows/deploy-app.yml`

- [ ] **Step 1: Create directory and workflow file**

```bash
mkdir -p .github/workflows
```

```yaml
name: Deploy App

on:
  push:
    branches: [main]
    paths:
      - 'packages/frontend/**'
      - 'packages/backend/**'
  workflow_dispatch:

permissions:
  id-token: write   # Required for OIDC
  contents: read

jobs:
  build-and-push:
    name: Build & Push Docker images
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.GH_ACTIONS_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - name: Log in to ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push backend image
        env:
          REPO: ${{ vars.AWS_ACCOUNT_ID }}.dkr.ecr.${{ vars.AWS_REGION }}.amazonaws.com/spyo-map-backend
          SHA: ${{ github.sha }}
        run: |
          docker build -t $REPO:latest -t $REPO:$SHA -f packages/backend/Dockerfile packages/backend
          docker push $REPO:latest
          docker push $REPO:$SHA

      - name: Build and push extractor image
        env:
          REPO: ${{ vars.AWS_ACCOUNT_ID }}.dkr.ecr.${{ vars.AWS_REGION }}.amazonaws.com/spyo-map-extractor
          SHA: ${{ github.sha }}
        run: |
          docker build -t $REPO:latest -t $REPO:$SHA -f packages/extractor/Dockerfile packages/extractor
          docker push $REPO:latest
          docker push $REPO:$SHA

  build-frontend:
    name: Build & Deploy Frontend
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: lts/*

      - run: npm ci

      - name: Build frontend
        env:
          VITE_BASE_PATH: /app/
          VITE_API_BASE_URL: ""
        run: npm run build --workspace=packages/frontend

      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.GH_ACTIONS_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - name: Sync frontend to S3
        run: |
          aws s3 sync packages/frontend/dist/ s3://spyo-map/app/ --delete

      - name: Invalidate CloudFront /app/*
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ vars.CLOUDFRONT_DIST_ID }} \
            --paths "/app/*"

  deploy-backend:
    name: Deploy Backend (ECS)
    runs-on: ubuntu-latest
    needs: build-and-push
    steps:
      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.GH_ACTIONS_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - name: Force new ECS deployment
        run: |
          aws ecs update-service \
            --cluster spyo-map \
            --service spyo-map-backend \
            --force-new-deployment

      - name: Wait for service to stabilise
        run: |
          aws ecs wait services-stable \
            --cluster spyo-map \
            --services spyo-map-backend

  smoke-test:
    name: Post-deployment Smoke Test
    runs-on: ubuntu-latest
    needs: [deploy-backend, build-frontend]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: lts/*

      - run: npm ci

      - name: Run smoke tests
        env:
          SMOKE_BASE_URL: https://${{ vars.CLOUDFRONT_DOMAIN }}
          ALB_DNS: ${{ vars.ALB_DNS }}
        run: npm test --workspace=packages/smoke-test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy-app.yml
git commit -m "feat: add GitHub Actions deploy-app workflow with smoke test"
```

---

### Task 18: Bootstrap runbook

**Files:**
- Create: `docs/runbooks/aws-bootstrap.md`

- [ ] **Step 1: Create docs/runbooks/ directory and runbook**

```bash
mkdir -p docs/runbooks
```

The content of `docs/runbooks/aws-bootstrap.md` is a mirror of the Bootstrap Runbook section in `docs/superpowers/specs/2026-04-20-aws-deployment-design.md`. Copy that section verbatim and prepend:

```markdown
# AWS Bootstrap Runbook

> This document mirrors the Bootstrap Runbook section from the design spec at
> `docs/superpowers/specs/2026-04-20-aws-deployment-design.md`.
> In case of conflict, the spec is the source of truth.
```

Then paste the Prerequisites + Steps 1-4 from the spec.

Additionally, add this section at the end for the two-pass apply:

```markdown
## Two-Pass Apply Note

Because `compute` (ECS task definition) needs the CloudFront domain for `IMAGES_BASE_URL`, and `cdn` (CloudFront) needs the ALB DNS from `compute`, there is a one-time ordering requirement on first bootstrap:

1. Step 2 (`terragrunt run-all apply`) applies all modules. On first run, `cloudfront_domain` is `""` in `infra/live/terragrunt.hcl`, so `IMAGES_BASE_URL` will be empty in the task definition.
2. After Step 2 completes, note the CloudFront domain from cdn output:
   ```bash
   cd infra/live/prod/cdn && terragrunt output -raw cloudfront_domain
   ```
3. Edit `infra/live/terragrunt.hcl` — set `cloudfront_domain = "<the domain>"`.
4. Re-apply compute only:
   ```bash
   cd infra/live/prod/compute && AWS_PROFILE=spyo-map terragrunt apply
   ```
   This updates the ECS task definition with the correct `IMAGES_BASE_URL`.
5. Force a new ECS deployment to pick up the updated task definition:
   ```bash
   aws ecs update-service --cluster spyo-map --service spyo-map-backend --force-new-deployment
   ```
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/aws-bootstrap.md
git commit -m "docs: add AWS bootstrap runbook"
```

---

### Task 19: Final verification

- [ ] **Step 1: Run all tests to confirm nothing is broken**

```bash
npm test
```

Expected: all existing backend, extractor, and frontend tests pass. The smoke-test package has no tests that can run locally (they require a deployment), so it will report 0 tests (or skip with a helpful error about missing env vars).

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no lint errors.

- [ ] **Step 3: Final commit summary**

All commits have been made incrementally. Verify with:

```bash
git log --oneline -20
```

Expected output includes (in order from oldest to newest):
```
chore: pin terraform 1.10 and terragrunt 0.77 in mise.toml
feat: make extractor storage credentials optional for IAM task role
feat: make extractor S3 client compatible with AWS IAM task role
feat: make backend S3 client compatible with AWS IAM task role
feat: make frontend base path configurable via VITE_BASE_PATH
feat: add smoke-test workspace with 4 post-deployment integration tests
feat: add networking Terraform module
feat: add storage Terraform module
feat: add ECR Terraform module
feat: add IAM Terraform module (OIDC, task roles, GH Actions role)
feat: add compute Terraform module (ECS, ALB, X-Origin-Verify)
feat: add CDN Terraform module (CloudFront, CF Function, S3 bucket policy)
feat: add scheduler Terraform module (EventBridge Scheduler + extractor task def)
feat: add idempotent bootstrap script for tfstate bucket
feat: add Terragrunt live config for all prod modules
feat: add GitHub Actions deploy-app workflow with smoke test
docs: add AWS bootstrap runbook
```

---

## Deployment Notes

### Docker images
The workflow assumes `packages/backend/Dockerfile` and `packages/extractor/Dockerfile` exist. Check the repo; if they don't exist, create minimal multi-stage Dockerfiles using `node:lts-alpine` as the base image, building with `npm run build` and running from `dist/`.

### Two-pass apply
See the Bootstrap Runbook (`docs/runbooks/aws-bootstrap.md`) — `cloudfront_domain` must be updated in `infra/live/terragrunt.hcl` and compute re-applied after the first deployment to set `IMAGES_BASE_URL` correctly.

### Narrowing IAM permissions after first deploy
The GitHub Actions role's `cloudfront:CreateInvalidation` is scoped to all distributions (`*`) until the CloudFront distribution ID is known. After the first `cdn` apply, update `infra/modules/iam/main.tf` to use the specific distribution ARN and re-apply `iam`.
