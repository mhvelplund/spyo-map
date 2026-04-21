output "backend_repo_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "extractor_repo_url" {
  value = aws_ecr_repository.extractor.repository_url
}

output "backend_repo_arn" {
  value = aws_ecr_repository.backend.arn
}

output "extractor_repo_arn" {
  value = aws_ecr_repository.extractor.arn
}
