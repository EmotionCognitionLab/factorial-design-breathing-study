
# DynamoDB setup
resource "aws_dynamodb_table" "users-table" {
  name           = "${var.project}-${var.env}-users"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "userId"
    type = "S"
  }

}

# save above table name to SSM so serverless can reference it
resource "aws_ssm_parameter" "dynamo-users-table" {
  name = "/${var.project}/${var.env}/info/dynamo/table/users"
  description = "Dynamo table holding user information"
  type = "SecureString"
  value = "${aws_dynamodb_table.users-table.name}"
}

resource "aws_dynamodb_table" "sessions-table" {
  name           = "${var.project}-${var.env}-sessions"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  range_key = "startDateTime"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "startDateTime"
    type = "N"
  }
}

# save above table name to SSM so serverless can reference it
resource "aws_ssm_parameter" "dynamo-sessions-table" {
  name = "/${var.project}/${var.env}/info/dynamo/table/sessions"
  description = "Dynamo table holding user breathing data"
  type = "SecureString"
  value = "${aws_dynamodb_table.sessions-table.name}"
}

resource "aws_dynamodb_table" "earnings-table" {
  name           = "${var.project}-${var.env}-earnings"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  range_key      = "dateType"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "dateType"
    type = "S"
  }
}

# save above table name to SSM so serverless can reference it
resource "aws_ssm_parameter" "earnings-table" {
  name = "/${var.project}/${var.env}/info/dynamo/table/earnings"
  description = "Dynamo table holding earnings info"
  type = "SecureString"
  value = "${aws_dynamodb_table.earnings-table.name}"
}
