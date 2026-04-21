variable "bucket_id" {
  type = string
}

variable "bucket_arn" {
  type = string
}

variable "bucket_regional_domain_name" {
  type = string
}

variable "oac_id" {
  type = string
}

variable "alb_dns_name" {
  type = string
}

variable "origin_verify_secret" {
  description = "Value of X-Origin-Verify header sent from CloudFront to ALB"
  type        = string
  sensitive   = true
}
