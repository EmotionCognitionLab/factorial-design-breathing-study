terraform {
  backend "s3" {
    bucket = "fds-tf-state"
    region = "us-west-2"
    key = "main"
    workspace_key_prefix = "workspaces"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.46"
    }
  }
}

provider "aws" {
    region = var.region
}

# S3 bucket for participant data
resource "aws_s3_bucket" "data-bucket" {
  bucket = "${var.data-bucket}"
}

resource "aws_s3_bucket_versioning" "data-bucket-versioning" {
  bucket = aws_s3_bucket.data-bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_cloudwatch_log_group" "console-log-group" {
  name = "${var.project}-${var.env}-console"
  retention_in_days = 30
}

output "console_log_writer_id" {
  value = aws_iam_access_key.console-log-writer-key.id
}

resource "aws_cloudwatch_log_metric_filter" "console-error" {
  name = "${var.project}-${var.env}-console-error"
  pattern = "error"
  log_group_name = aws_cloudwatch_log_group.console-log-group.name

  metric_transformation {
    name = "${var.project}-${var.env}-console-error-count"
    namespace = "LogMetrics"
    value = "1"
  }
}

# provisioner is used b/c trying to set up an email
# subscription to an sns topic via aws_sns_topic_subscription
# fails with:
# error creating SNS topic subscription: InvalidParameter: Invalid parameter: Email address
# provisioner will only run when the topic is first created
# and will *not* update the subscriptions when var.error-notification-emails is changed.
# https://medium.com/@raghuram.arumalla153/aws-sns-topic-subscription-with-email-protocol-using-terraform-ed05f4f19b73
# https://github.com/rarumalla1/terraform-projects/tree/master/aws-sns-email-subscription-terraform-using-command
resource "aws_sns_topic" "errors" {
  name = "${var.project}-${var.env}-errors-topic"
  provisioner "local-exec" {
    command = "/usr/bin/env bash sns-subscription.sh"
    environment = {
      sns_arn = self.arn
      sns_emails = var.error-notification-emails
     }
  }
}

resource "aws_cloudwatch_metric_alarm" "console-error-alarm" {
  alarm_name = "${var.project}-${var.env}-console-error-alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods = 1
  period = 300
  metric_name = "${var.project}-${var.env}-console-error-count"
  namespace = "LogMetrics"
  statistic = "Sum"
  threshold = 0
  alarm_actions = [aws_sns_topic.errors.arn]
  datapoints_to_alarm = 1
  treat_missing_data = "notBreaching"
}

resource "aws_ssm_parameter" "redcap-inbound-token" {
  name = "/${var.project}/${var.env}/info/redcap/inbound/token"
  description = "Token REDCap sends us"
  type = "SecureString"
  value = var.redcap-inbound-token
}

resource "aws_ssm_parameter" "report-recipients" {
  name = "/${var.project}/${var.env}/info/report/recipients"
  description = "Recipients of user condition report"
  type = "SecureString"
  value = var.report-recipients
}

