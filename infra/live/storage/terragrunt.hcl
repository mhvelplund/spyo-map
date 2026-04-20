include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../modules/storage"
}

inputs = {
  bucket_name = local.bucket_name
}

locals {
  bucket_name = read_terragrunt_config(find_in_parent_folders()).locals.bucket_name
}
