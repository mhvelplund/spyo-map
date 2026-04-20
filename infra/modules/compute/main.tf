resource "random_string" "origin_verify" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "origin_verify" {
  name  = "/${var.app_name}/origin-verify-secret"
  type  = "SecureString"
  value = random_string.origin_verify.result
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.app_name}-backend"
  retention_in_days = 14
}

resource "aws_lb" "main" {
  name               = "${var.app_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_sg_id]
  subnets            = var.public_subnet_ids
}

resource "aws_lb_target_group" "backend" {
  name        = "${var.app_name}-backend"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/api/images"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 10
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }
}

resource "aws_lb_listener_rule" "backend" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [random_string.origin_verify.result]
    }
  }
}

resource "aws_ecs_cluster" "main" {
  name = var.app_name
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.app_name}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = var.ecs_task_execution_role_arn
  task_role_arn            = var.backend_task_role_arn

  container_definitions = jsonencode([{
    name      = "backend"
    image     = "${var.backend_repo_url}:latest"
    essential = true
    portMappings = [{
      containerPort = 3001
      protocol      = "tcp"
    }]
    environment = [
      { name = "PORT",                   value = "3001" },
      { name = "STORAGE_BUCKET",         value = var.bucket_name },
      { name = "STORAGE_REGION",         value = var.storage_region },
      { name = "IMAGES_BASE_URL",        value = var.cloudfront_domain != "" ? "https://${var.cloudfront_domain}" : "" },
      { name = "DB_REFRESH_INTERVAL_MS", value = "300000" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = var.storage_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "backend" {
  name            = "${var.app_name}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [var.public_subnet_a_id]
    security_groups  = [var.backend_ecs_sg_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 3001
  }

  depends_on = [aws_lb_listener_rule.backend]
}
