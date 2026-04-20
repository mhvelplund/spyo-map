include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../modules/networking"
}

inputs = {
  app_name = local.app_name
  region   = local.region
}

locals {
  app_name = read_terragrunt_config(find_in_parent_folders()).locals.app_name
  region   = read_terragrunt_config(find_in_parent_folders()).locals.region
}
