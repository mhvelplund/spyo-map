include "root" {
  path = find_in_parent_folders("root.hcl")
  expose = true
}

terraform {
  source = "../../modules/storage"
}

inputs = {
  bucket_name = include.root.locals.bucket_name
}
