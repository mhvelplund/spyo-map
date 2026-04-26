include "root" {
  path = find_in_parent_folders("root.hcl")
  expose = true
}

terraform {
  source = "../../modules/compute"
}

dependency "networking" {
  config_path = "../networking"
  mock_outputs = {
    vpc_id = "vpc-12345678"
    public_subnet_ids = ["subnet-12345678", "subnet-87654321"]
    public_subnet_a_id = "subnet-12345678"
    alb_sg_id = "sg-12345678"
    backend_ecs_sg_id = "sg-87654321"
  }
}

dependency "iam" {
  config_path = "../iam"
  mock_outputs = {
    ecs_task_execution_role_arn = "arn:aws:iam::123456789012:role/ecsTaskExecutionRole"
    backend_task_role_arn = "arn:aws:iam::123456789012:role/backendTaskRole"
  }
}

dependency "ecr" {
  config_path = "../ecr"
  mock_outputs = {
    backend_repo_url = "123456789012.dkr.ecr.us-east-1.amazonaws.com/backend:latest"
  }
}

dependency "storage" {
  config_path = "../storage"
  mock_outputs = {
    bucket_id = "my-app-bucket"
  }
}

inputs = {
  app_name                    = include.root.locals.app_name
  region                      = include.root.locals.region
  vpc_id                      = dependency.networking.outputs.vpc_id
  public_subnet_ids           = dependency.networking.outputs.public_subnet_ids
  public_subnet_a_id          = dependency.networking.outputs.public_subnet_a_id
  alb_sg_id                   = dependency.networking.outputs.alb_sg_id
  backend_ecs_sg_id           = dependency.networking.outputs.backend_ecs_sg_id
  ecs_task_execution_role_arn = dependency.iam.outputs.ecs_task_execution_role_arn
  backend_task_role_arn       = dependency.iam.outputs.backend_task_role_arn
  backend_repo_url            = dependency.ecr.outputs.backend_repo_url
  bucket_name                 = dependency.storage.outputs.bucket_id
  storage_region              = include.root.locals.region
  cloudfront_domain           = include.root.locals.cloudfront_domain
}
