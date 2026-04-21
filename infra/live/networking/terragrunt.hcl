include "root" {
  path = find_in_parent_folders("root.hcl")
  expose = true
}

terraform {
  source = "../../modules/networking"
}

inputs = {
  app_name = include.root.locals.app_name
  region   = include.root.locals.region
}
