resource "aws_cloudwatch_log_group" "extractor" {
  name              = "/ecs/${var.app_name}-extractor"
  retention_in_days = 14
}

resource "aws_ecs_task_definition" "extractor" {
  family                   = "${var.app_name}-extractor"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = var.ecs_task_execution_role_arn
  task_role_arn            = var.extractor_task_role_arn

  container_definitions = jsonencode([{
    name      = "extractor"
    image     = "${var.extractor_repo_url}:latest"
    essential = true
    environment = [
      { name = "STORAGE_BUCKET", value = var.bucket_name },
      { name = "STORAGE_REGION", value = var.storage_region },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.extractor.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

# IAM role allowing EventBridge Scheduler to run ECS tasks
resource "aws_iam_role" "eventbridge_scheduler" {
  name = "${var.app_name}-eventbridge-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "eventbridge_scheduler" {
  name = "run-extractor"
  role = aws_iam_role.eventbridge_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecs:RunTask"]
        Resource = ["${aws_ecs_task_definition.extractor.arn_without_revision}:*"]
      },
      {
        Effect = "Allow"
        Action = ["iam:PassRole"]
        Resource = [
          var.extractor_task_role_arn,
          var.ecs_task_execution_role_arn,
        ]
      },
    ]
  })
}

resource "aws_scheduler_schedule" "extractor_daily" {
  name       = "${var.app_name}-extractor-daily"
  group_name = "default"

  flexible_time_window {
    mode = "OFF"
  }

  # 15:00 UTC = 16:00 GMT+1
  schedule_expression          = "cron(0 15 * * ? *)"
  schedule_expression_timezone = "UTC"

  target {
    arn      = var.ecs_cluster_arn
    role_arn = aws_iam_role.eventbridge_scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.extractor.arn
      launch_type         = "FARGATE"

      network_configuration {
        subnets          = [var.public_subnet_a_id]
        security_groups  = [var.extractor_ecs_sg_id]
        assign_public_ip = true
      }
    }
  }
}
