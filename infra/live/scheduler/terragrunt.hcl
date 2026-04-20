include "root" {
  path   = find_in_parent_folders("root.hcl")
  expose = true
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
  app_name                    = include.root.locals.app_name
  region                      = include.root.locals.region
  public_subnet_a_id          = dependency.networking.outputs.public_subnet_a_id
  extractor_ecs_sg_id         = dependency.networking.outputs.extractor_ecs_sg_id
  ecs_cluster_arn             = dependency.compute.outputs.ecs_cluster_arn
  ecs_task_execution_role_arn = dependency.iam.outputs.ecs_task_execution_role_arn
  extractor_task_role_arn     = dependency.iam.outputs.extractor_task_role_arn
  extractor_repo_url          = dependency.ecr.outputs.extractor_repo_url
  bucket_name                 = include.root.locals.bucket_name
  storage_region              = include.root.locals.region
}
