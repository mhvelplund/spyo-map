include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../modules/compute"
}

dependency "networking" {
  config_path = "../networking"
}

dependency "iam" {
  config_path = "../iam"
}

dependency "ecr" {
  config_path = "../ecr"
}

dependency "storage" {
  config_path = "../storage"
}

inputs = {
  app_name                    = local.app_name
  region                      = local.region
  vpc_id                      = dependency.networking.outputs.vpc_id
  public_subnet_ids           = dependency.networking.outputs.public_subnet_ids
  public_subnet_a_id          = dependency.networking.outputs.public_subnet_a_id
  alb_sg_id                   = dependency.networking.outputs.alb_sg_id
  backend_ecs_sg_id           = dependency.networking.outputs.backend_ecs_sg_id
  ecs_task_execution_role_arn = dependency.iam.outputs.ecs_task_execution_role_arn
  backend_task_role_arn       = dependency.iam.outputs.backend_task_role_arn
  backend_repo_url            = dependency.ecr.outputs.backend_repo_url
  bucket_name                 = dependency.storage.outputs.bucket_id
  storage_region              = local.region
  cloudfront_domain           = local.cloudfront_domain
}

locals {
  app_name          = read_terragrunt_config(find_in_parent_folders()).locals.app_name
  region            = read_terragrunt_config(find_in_parent_folders()).locals.region
  cloudfront_domain = read_terragrunt_config(find_in_parent_folders()).locals.cloudfront_domain
}
