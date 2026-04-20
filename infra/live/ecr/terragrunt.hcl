include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../modules/ecr"
}

inputs = {
  app_name = local.app_name
}

locals {
  app_name = read_terragrunt_config(find_in_parent_folders()).locals.app_name
}
