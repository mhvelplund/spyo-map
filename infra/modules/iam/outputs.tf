output "github_actions_role_arn" {
  value = aws_iam_role.github_actions.arn
}

output "ecs_task_execution_role_arn" {
  value = aws_iam_role.ecs_task_execution.arn
}

output "backend_task_role_arn" {
  value = aws_iam_role.backend_task.arn
}

output "extractor_task_role_arn" {
  value = aws_iam_role.extractor_task.arn
}
