include "root" {
  path   = find_in_parent_folders("root.hcl")
  expose = true
}

terraform {
  source = "../../modules/scheduler"
}

dependency "networking" {
  config_path = "../networking"
  mock_outputs = {
    public_subnet_a_id = "subnet-12345678"
    extractor_ecs_sg_id = "sg-12345678"
  }
}

dependency "compute" {
  config_path = "../compute"
  mock_outputs = {
    ecs_cluster_arn = "arn:aws:ecs:us-east-1:123456789012:cluster/my-app-cluster"
  }
}

dependency "iam" {
  config_path = "../iam"
  mock_outputs = {
    ecs_task_execution_role_arn = "arn:aws:iam::123456789012:role/ecsTaskExecutionRole"
    extractor_task_role_arn = "arn:aws:iam::123456789012:role/extractorTaskRole"
  }
}

dependency "ecr" {
  config_path = "../ecr"
  mock_outputs = {
    extractor_repo_url = "123456789012.dkr.ecr.us-east-1.amazonaws.com/extractor:latest"
  }
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
