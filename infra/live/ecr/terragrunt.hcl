include "root" {
  path = find_in_parent_folders("root.hcl")
  expose = true
}

terraform {
  source = "../../modules/ecr"
}

inputs = {
  app_name = include.root.locals.app_name
}
