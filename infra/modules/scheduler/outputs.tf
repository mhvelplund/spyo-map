output "extractor_task_definition_arn" {
  value = aws_ecs_task_definition.extractor.arn
}

output "scheduler_schedule_arn" {
  value = aws_scheduler_schedule.extractor_daily.arn
}
