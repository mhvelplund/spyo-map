include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "../../modules/cdn"
}

dependency "storage" {
  config_path = "../storage"
  mock_outputs = {
    bucket_id = "my-app-bucket"
    bucket_arn = "arn:aws:s3:::my-app-bucket"
    bucket_regional_domain_name = "my-app-bucket.s3.amazonaws.com"
    oac_id = "oac-12345678"
  }
}

dependency "compute" {
  config_path = "../compute"
  mock_outputs = {
    alb_dns_name = "my-alb-12345678.us-east-1.elb.amazonaws.com"
    origin_verify_secret = "origin-verify-secret-value"
  }
}

inputs = {
  bucket_id                   = dependency.storage.outputs.bucket_id
  bucket_arn                  = dependency.storage.outputs.bucket_arn
  bucket_regional_domain_name = dependency.storage.outputs.bucket_regional_domain_name
  oac_id                      = dependency.storage.outputs.oac_id
  alb_dns_name                = dependency.compute.outputs.alb_dns_name
  origin_verify_secret        = dependency.compute.outputs.origin_verify_secret
}
