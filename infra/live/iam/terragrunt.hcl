include "root" {
  path = find_in_parent_folders("root.hcl")
  expose = true
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
  account_id          = include.root.locals.account_id
  region              = include.root.locals.region
  bucket_name         = dependency.storage.outputs.bucket_id
  backend_repo_arn    = dependency.ecr.outputs.backend_repo_arn
  extractor_repo_arn  = dependency.ecr.outputs.extractor_repo_arn
}
