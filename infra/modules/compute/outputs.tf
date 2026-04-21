output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "ecs_cluster_arn" {
  value = aws_ecs_cluster.main.arn
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "origin_verify_secret" {
  value     = random_string.origin_verify.result
  sensitive = true
}
