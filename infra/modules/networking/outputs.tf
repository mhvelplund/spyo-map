output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = [aws_subnet.public_a.id, aws_subnet.public_b.id]
}

output "public_subnet_a_id" {
  value = aws_subnet.public_a.id
}

output "alb_sg_id" {
  value = aws_security_group.alb.id
}

output "backend_ecs_sg_id" {
  value = aws_security_group.backend_ecs.id
}

output "extractor_ecs_sg_id" {
  value = aws_security_group.extractor_ecs.id
}
