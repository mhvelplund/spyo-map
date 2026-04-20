include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../modules/scheduler"
}

dependency "networking" {
  config_path = "../networking"
}

dependency "compute" {
  config_path = "../compute"
}

dependency "iam" {
  config_path = "../iam"
}

dependency "ecr" {
  config_path = "../ecr"
}

inputs = {
  app_name                    = local.app_name
  region                      = local.region
  public_subnet_a_id          = dependency.networking.outputs.public_subnet_a_id
  extractor_ecs_sg_id         = dependency.networking.outputs.extractor_ecs_sg_id
  ecs_cluster_arn             = dependency.compute.outputs.ecs_cluster_arn
  ecs_task_execution_role_arn = dependency.iam.outputs.ecs_task_execution_role_arn
  extractor_task_role_arn     = dependency.iam.outputs.extractor_task_role_arn
  extractor_repo_url          = dependency.ecr.outputs.extractor_repo_url
  bucket_name                 = local.bucket_name
  storage_region              = local.region
}

locals {
  app_name    = read_terragrunt_config(find_in_parent_folders()).locals.app_name
  region      = read_terragrunt_config(find_in_parent_folders()).locals.region
  bucket_name = read_terragrunt_config(find_in_parent_folders()).locals.bucket_name
}
