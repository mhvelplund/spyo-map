variable "app_name" {
  type = string
}

variable "region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "public_subnet_a_id" {
  description = "Single AZ subnet for ECS service (eu-north-1a)"
  type        = string
}

variable "alb_sg_id" {
  type = string
}

variable "backend_ecs_sg_id" {
  type = string
}

variable "ecs_task_execution_role_arn" {
  type = string
}

variable "backend_task_role_arn" {
  type = string
}

variable "backend_repo_url" {
  type = string
}

variable "bucket_name" {
  type = string
}

variable "storage_region" {
  type = string
}

variable "cloudfront_domain" {
  description = "CloudFront domain for IMAGES_BASE_URL. Empty string on first apply; update and re-apply after cdn module creates the distribution."
  type        = string
  default     = ""
}
