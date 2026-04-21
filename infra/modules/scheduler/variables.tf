variable "app_name" {
  type = string
}

variable "region" {
  type = string
}

variable "public_subnet_a_id" {
  type = string
}

variable "extractor_ecs_sg_id" {
  type = string
}

variable "ecs_cluster_arn" {
  type = string
}

variable "ecs_task_execution_role_arn" {
  type = string
}

variable "extractor_task_role_arn" {
  type = string
}

variable "extractor_repo_url" {
  type = string
}

variable "bucket_name" {
  type = string
}

variable "storage_region" {
  type = string
}
