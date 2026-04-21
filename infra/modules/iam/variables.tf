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
