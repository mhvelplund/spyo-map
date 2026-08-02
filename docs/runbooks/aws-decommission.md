# AWS Decommission

Run **after** `spyo-map.isntall.net` is confirmed serving from Cloudflare. Steps 4 and 5 are irreversible.

## 1. Copy the photo data out of S3

Both the processed images and anything still waiting in `raw/`.

```bash
aws s3 sync s3://<old-bucket>/images/ ./migration/images/
aws s3 sync s3://<old-bucket>/raw/    ./migration/raw/
```

Record the object count so it can be checked against R2:

```bash
aws s3 ls s3://<old-bucket>/images/ --recursive | wc -l
```

## 2. Upload into R2

Configure rclone with the R2 credentials from the bootstrap runbook, then:

```bash
rclone copy ./migration/images/ r2:spyo-map/images/ --progress
rclone copy ./migration/raw/    r2:spyo-map/raw/    --progress
rclone size r2:spyo-map/images/
```

The object count must match step 1.

## 3. Populate D1

The image ids in R2 were derived from the old S3 keys and ETags, so they cannot be recomputed from the copied files.
Export the metadata from the old `images.db` instead.

```bash
aws s3 cp s3://<old-bucket>/images.db ./migration/images.db
sqlite3 ./migration/images.db ".dump images" > ./migration/images.sql
```

Edit `images.sql` to drop the `CREATE TABLE` and `CREATE INDEX` statements — the schema is already applied by the
migration — leaving only `INSERT` statements. Then:

```bash
npx wrangler d1 execute spyo-map --remote \
  --config packages/worker/wrangler.toml --file ./migration/images.sql
```

Verify the row count matches the image count from step 2:

```bash
npx wrangler d1 execute spyo-map --remote \
  --config packages/worker/wrangler.toml --command "SELECT COUNT(*) FROM images"
```

## 4. Verify the live site before destroying anything

- `https://spyo-map.isntall.net/` loads and the map renders markers
- `https://spyo-map.isntall.net/api/health` returns `{"status":"ok"}`
- `https://spyo-map.isntall.net/api/images` returns the expected number of records
- A deep link such as `https://spyo-map.isntall.net/#/image/<id>` opens the modal
- A thumbnail loads from `spyo-img.isntall.net`
- The **Ingest Photos** workflow succeeds on a test photo placed in `raw/`

Do not continue until all six pass.

## 5. Destroy the AWS resources

The `infra/` tree was deleted from the repository in commit `e8a30f1` ("chore: remove AWS infrastructure, Docker, and
the AWS deploy workflow"). Recover it from its parent commit, `9fc8ecb`, to run the destroy:

```bash
git checkout 9fc8ecb -- infra/
cd infra/live && terragrunt run-all destroy
```

Then confirm in the console that all of these are gone: the ALB, the ECS cluster and services, both ECR repositories,
the CloudFront distribution, the S3 bucket, the EventBridge schedule, the CloudWatch log groups, and the VPC with its
NAT gateway.

Discard the recovered tree afterwards — it is not coming back:

```bash
git checkout -- . && rm -rf infra
```

## 6. Delete the leftover credentials

- **IAM → Users → Access keys:** delete the long-lived key pair that `extract.sh` used. It is useless once the bucket is
  gone, and leaving an active key is pointless risk.
- **IAM → Roles:** delete the GitHub OIDC role the old deploy workflow assumed, and the ECS task and execution roles.
- **IAM → Identity providers:** delete the GitHub OIDC provider if nothing else uses it.

## 7. Confirm the bill is zero

Check **Billing → Bills** at the start of the following month. Route 53 hosted zones and retained EBS snapshots are the
usual survivors of a "complete" teardown.
