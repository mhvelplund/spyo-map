locals {
  region     = "eu-north-1"
  account_id = get_aws_account_id()
  app_name   = "spyo-map"
  bucket_name = "${local.app_name}-images"

  # Circular dependency resolution:
  # On first apply, leave cloudfront_domain as "". After cdn module creates
  # the distribution, set this to the output of `terragrunt output cloudfront_domain`
  # in infra/live/cdn/, then re-apply infra/live/compute/.
  cloudfront_domain = ""
}

remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite"
  }
  config = {
    bucket         = "spyo-map-tf-state"
    key            = "${path_relative_to_include()}/terraform.tfstate"
    region         = local.region
    encrypt        = true
    use_lockfile   = true
  }
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite"
  contents  = <<EOF
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0"
    }
  }
}

provider "aws" {
  region = "${local.region}"
  default_tags {
    tags = {
      app = "${local.app_name}"
    }
  }
}
EOF
}
