include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "../../modules/cdn"
}

dependency "storage" {
  config_path = "../storage"
}

dependency "compute" {
  config_path = "../compute"
}

inputs = {
  bucket_id                   = dependency.storage.outputs.bucket_id
  bucket_arn                  = dependency.storage.outputs.bucket_arn
  bucket_regional_domain_name = dependency.storage.outputs.bucket_regional_domain_name
  oac_id                      = dependency.storage.outputs.oac_id
  alb_dns_name                = dependency.compute.outputs.alb_dns_name
  origin_verify_secret        = dependency.compute.outputs.origin_verify_secret
}
