include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../modules/iam"
}

dependency "storage" {
  config_path = "../storage"
}

dependency "ecr" {
  config_path = "../ecr"
}

inputs = {
  account_id          = local.account_id
  region              = local.region
  bucket_name         = dependency.storage.outputs.bucket_id
  backend_repo_arn    = dependency.ecr.outputs.backend_repo_arn
  extractor_repo_arn  = dependency.ecr.outputs.extractor_repo_arn
}

locals {
  account_id = read_terragrunt_config(find_in_parent_folders()).locals.account_id
  region     = read_terragrunt_config(find_in_parent_folders()).locals.region
}
