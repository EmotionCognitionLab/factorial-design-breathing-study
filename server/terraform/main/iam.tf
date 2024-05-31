
# IAM policies
resource "aws_iam_policy" "cloudwatch-write" {
  name = "${var.project}-${var.env}-cloudwatch-write"
  path = "/policy/cloudwatch/"
  description = "Allows writing to CloudWatch logs"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# Policy to allow authenticated users to write data to
# their own folder
resource "aws_iam_policy" "s3-write-experiment-data" {
  name = "${var.project}-${var.env}-s3-write-experiment-data"
  path = "/policy/s3/experimentData/write/"
  description = "Allows writing data to participant's own s3 folder"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::${var.data-bucket}/*/$${cognito-identity.amazonaws.com:sub}",
        "arn:aws:s3:::${var.data-bucket}/*/$${cognito-identity.amazonaws.com:sub}/*"
      ]
    }
  ]
}
POLICY
}

# Policy to allow authenticated users to read data from
# their own folder
resource "aws_iam_policy" "s3-read-experiment-data" {
  name = "${var.project}-${var.env}-s3-read-experiment-data"
  path = "/policy/s3/experimentData/read/"
  description = "Allows reading data from participant's own s3 folder"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::${var.data-bucket}/*/$${cognito-identity.amazonaws.com:sub}",
        "arn:aws:s3:::${var.data-bucket}/*/$${cognito-identity.amazonaws.com:sub}/*"
      ]
    }
  ]
}
POLICY
}

data "aws_caller_identity" "current" {}

# policy to allow reading/writing to dynamo
resource "aws_iam_policy" "dynamodb-read-write" {
  name = "${var.project}-${var.env}-dynamodb-read-write"
  path = "/policy/dynamodb/all/"
  description = "Allows reading from/writing to dynamodb tables"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:UpdateItem",
        "dynamodb:DescribeTable",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/*"
      ]
    }
  ]
}
POLICY
}

# policy to allow limited reading/writing of dynamo user table
resource "aws_iam_policy" "dynamodb-user-read-write" {
  name = "${var.project}-${var.env}-dynamodb-user-read-write"
  path = "/policy/dynamodb/users/all/"
  description = "Allows limited reading from/writing to dynamodb user table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:UpdateItem",
        "dynamodb:DescribeTable",
        "dynamodb:Query",
        "dynamodb:GetItem",
        "dynamodb:Scan",
        "dynamodb:PutItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.users-table.name}"
      ]
    }
  ]
}
POLICY
}

# policy to allow limited reading of dynamo user table
resource "aws_iam_policy" "dynamodb-user-read" {
  name = "${var.project}-${var.env}-dynamodb-user-read"
  path = "/policy/dynamodb/users/read/all/"
  description = "Allows limited reading from dynamodb user table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.users-table.name}"
      ]
    }
  ]
}
POLICY
}

# Policy to allow reading from the sessions table
resource "aws_iam_policy" "dynamodb-read-all-sessions" {
  name = "${var.project}-${var.env}-dynamodb-read-all-sessions"
  path = "/policy/dynamodb/sessions/readAll/"
  description = "Allows reading all data from Dynamodb sessions table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:DescribeTable",
        "dynamodb:Query",
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.sessions-table.name}"
      ]
    }
  ]
}
POLICY
}

# Policy to allow writing to the sessions table
resource "aws_iam_policy" "dynamodb-write-all-sessions" {
  name = "${var.project}-${var.env}-dynamodb-write-all-sessions"
  path = "/policy/dynamodb/sessions/writeAll/"
  description = "Allows writing to the Dynamodb sessions table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.sessions-table.name}"
      ]
    }
  ]
}
POLICY
}

# policy to allow sns publishing
resource "aws_iam_policy" "sns-publish" {
  name = "${var.project}-${var.env}-sns-publish"
  path = "/policy/sns/publish/"
  description = "Allows SNS publishing"
  policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [ "sns:publish" ]
          Resource = [ "*" ]
        }
      ]
    }) 
}

# policy to allow email send via SES
resource "aws_iam_policy" "ses-send" {
  name = "${var.project}-${var.env}-ses-send"
  path = "/policy/ses/send/"
  description = "Allows emails sends via SES"
  policy = jsonencode({
    Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [ "ses:SendEmail", "ses:SendRawEmail" ]
          Resource = [ "*" ]
        }
      ]
  })
}

# policy to allow limited reading of dynamo earnings table
resource "aws_iam_policy" "dynamodb-earnings-read" {
  name = "${var.project}-${var.env}-dynamodb-earnings-read"
  path = "/policy/dynamodb/earnings/read/"
  description = "Allows limited reading from dynamodb earnings table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.earnings-table.name}"
      ]
    }
  ]
}
POLICY
}

# policy to allow limited writing to dynamo earnings table
resource "aws_iam_policy" "dynamodb-earnings-write" {
  name = "${var.project}-${var.env}-dynamodb-earnings-write"
  path = "/policy/dynamodb/earnings/write/"
  description = "Allows limited writing to dynamodb earnings table"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:UpdateItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.earnings-table.name}"
      ]
    }
  ]
}
POLICY
}

# TODO
# FOR TESTING ONLY - delete this before going to production
# policy to allow scans and batch writes of sessions, earnings tables,
# so that user data can be deleted when switching conditions
resource "aws_iam_policy" "dynamodb-earnings-sessions-read-write" {
  name = "${var.project}-${var.env}-dynamodb-earnings-sessions-read-write"
  path = "/policy/dynamodb/testing/only/"
  description = "Allows reading/writing to/from dynamodb earnings and sessions tables"
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Scan",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.earnings-table.name}",
        "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${aws_dynamodb_table.sessions-table.name}"
      ]
    }
  ]
}
POLICY
}

# IAM roles
resource "aws_iam_role" "lambda-sqlite-process" {
  name = "${var.project}-${var.env}-lambda-sqlite-process"
  path = "/role/lambda/sqlite/process/"
  description = "Role for lambda function(s) processing sqlite files uploaded to usr data bucket"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
      }
    ]
  })

  inline_policy {
    name = "${var.project}-${var.env}-usr-data-bucket-read"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [
            "s3:GetObject"
          ]
          Resource = [
            "${aws_s3_bucket.data-bucket.arn}/*"
          ]
        }
      ]
    })
  }

  managed_policy_arns = [
    aws_iam_policy.cloudwatch-write.arn,
    aws_iam_policy.dynamodb-read-all-sessions.arn,
    aws_iam_policy.dynamodb-write-all-sessions.arn
  ]
}

# save above IAM role to SSM so serverless can reference it
resource "aws_ssm_parameter" "lambda-sqlite-role" {
  name = "/${var.project}/${var.env}/role/lambda/sqlite/process"
  description = "ARN for lambda role to process sqlite files uploaded to usr data bucket"
  type = "SecureString"
  value = "${aws_iam_role.lambda-sqlite-process.arn}"
}

resource "aws_iam_role" "user-data-reader-writer" {
  name = "${var.project}-${var.env}-s3-reader-writer"
  path = "/role/user/s3/readwrite/"
  description = "Allows cognito-auth'd users to read and write their own data from/to the s3 user data bucket."
  assume_role_policy    = jsonencode(
      {
          Statement = [
              {
                  Action    = "sts:AssumeRoleWithWebIdentity"
                  Condition = {
                      StringEquals = {
                          "cognito-identity.amazonaws.com:aud" = "${aws_cognito_identity_pool.main.id}"
                      }
                  }
                  Effect    = "Allow"
                  Principal = {
                      Federated = "cognito-identity.amazonaws.com"
                  }
              },
          ]
          Version   = "2012-10-17"
      }
  )
  managed_policy_arns   = [
      aws_iam_policy.s3-write-experiment-data.arn,
      aws_iam_policy.s3-read-experiment-data.arn
  ]
}

resource "aws_iam_role" "unauthenticated" {
  name = "${var.project}-${var.env}-cognito-unauthenticated"
  path = "/role/user/unauthenticated/"
  description = "Minimal role for unauthenticated cognito uesrs"
  assume_role_policy    = jsonencode(
      {
          Statement = [
              {
                  Action    = "sts:AssumeRoleWithWebIdentity"
                  Condition = {
                      StringEquals = {
                          "cognito-identity.amazonaws.com:aud" = "${aws_cognito_identity_pool.main.id}"
                      },
                      "ForAnyValue:StringLike" = {
                        "cognito-identity.amazonaws.com:amr" = "unauthenticated"
                      }
                  }
                  Effect    = "Allow"
                  Principal = {
                      Federated = "cognito-identity.amazonaws.com"
                  }
              },
          ]
          Version   = "2012-10-17"
      }
  )

  inline_policy {
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [
            "mobileanalytics:PutEvents",
            "cognito-sync:*"
          ]
          Resource = [
            "*"
          ]
        }
      ]
    })
  }
}

# TODO TESTING ONLY remove aws_iam_policy.dynamodb-earnings-sessions-read-write
# from managed_policy_arns before production
resource "aws_iam_role" "lambda" {
  name = "${var.project}-${var.env}-lambda"
  path = "/role/lambda/"
  description = "Basic role for running lambda functions"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
      }
    ]
  })

  managed_policy_arns   = [
    aws_iam_policy.dynamodb-user-read-write.arn,
    aws_iam_policy.dynamodb-earnings-read.arn,
    aws_iam_policy.dynamodb-earnings-sessions-read-write.arn,
    aws_iam_policy.cloudwatch-write.arn
  ]
}

# save above IAM role to SSM so serverless can reference it
resource "aws_ssm_parameter" "lambda-role" {
  name = "/${var.project}/${var.env}/role/lambda"
  description = "ARN for lambda role"
  type = "SecureString"
  value = "${aws_iam_role.lambda.arn}"
}

resource "aws_iam_role" "lambda-earnings" {
  name = "${var.project}-${var.env}-lambda-earnings"
  path = "/role/lambda/earnings/"
  description = "Role for lambda functions that handle earnings"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
      }
    ]
  })

  managed_policy_arns   = [
    aws_iam_policy.dynamodb-user-read.arn,
    aws_iam_policy.dynamodb-read-all-sessions.arn,
    aws_iam_policy.dynamodb-earnings-read.arn,
    aws_iam_policy.dynamodb-earnings-write.arn,
    aws_iam_policy.cloudwatch-write.arn
  ]
}

# save above IAM role to SSM so serverless can reference it
resource "aws_ssm_parameter" "lambda-earnings-role" {
  name = "/${var.project}/${var.env}/role/lambda/earnings"
  description = "ARN for lambda-earnings role"
  type = "SecureString"
  value = "${aws_iam_role.lambda-earnings.arn}"
}

# Policy for unregistered users for registration
resource "aws_iam_role" "lambda-unregistered" {
  name = "${var.project}-${var.env}-lambda-unregistered"
  path = "/role/lambda/unregistered/"
  description = "Role for lambda function that handles unregistered users"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
      }
    ]
  })

  managed_policy_arns   = [
    aws_iam_policy.dynamodb-user-read.arn,
    # aws_iam_policy.ses-send.arn,
    # aws_iam_policy.sqs-registration-read-write.arn,
    aws_iam_policy.cloudwatch-write.arn
  ]
}

# save above IAM role to SSM so serverless can reference it
resource "aws_ssm_parameter" "lambda-unregistered-role" {
  name = "/${var.project}/${var.env}/role/lambda/unregistered"
  description = "ARN for lambda-unregistered role"
  type = "SecureString"
  value = "${aws_iam_role.lambda-unregistered.arn}"
}


resource "aws_iam_role_policy" "lambda-role-assumption" {
  name = "${var.project}-${var.env}-lambda-role-assumption-policy"
  role = aws_iam_role.lambda.name
  policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [
            "sts:AssumeRole"
          ]
          Resource = [
            "${aws_iam_role.study-admin.arn}"
          ]
        }
      ]
    })
}

resource "aws_iam_role" "study-admin" {
  name = "${var.project}-${var.env}-study-admin"
  path = "/role/admin/"
  description = "Role for study administrators"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "${aws_iam_role.lambda.arn}"
          Service = "lambda.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
      },
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = [
          "sts:AssumeRoleWithWebIdentity"
        ]
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = "${aws_cognito_identity_pool.main.id}"
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr": "authenticated"
          }
        }
      }
    ]
  })

  managed_policy_arns   = [
    aws_iam_policy.dynamodb-read-write.arn, aws_iam_policy.cloudwatch-write.arn
  ]
}

resource "aws_iam_role" "lambda-dynamodb-sns-ses" {
  name = "${var.project}-${var.env}-lambda-dynamodb-sns-ses"
  path = "/role/lambda/dynamodb/sns/ses/"
  description = "Role for lambda functions needing dynamo, sns and ses access"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
      }
    ]
  })

  managed_policy_arns   = [
    aws_iam_policy.dynamodb-read-write.arn,
    aws_iam_policy.sns-publish.arn,
    aws_iam_policy.ses-send.arn,
    aws_iam_policy.cloudwatch-write.arn
  ]
}

# save above IAM role to SSM so serverless can reference it
resource "aws_ssm_parameter" "lambda-dynamodb-sns-ses-role" {
  name = "/${var.project}/${var.env}/role/lambda/dynamodb/sns/ses"
  description = "ARN for lambda role with dynamodb, sns and ses access"
  type = "SecureString"
  value = "${aws_iam_role.lambda-dynamodb-sns-ses.arn}"
}

resource "aws_iam_role" "cognito-sns" {
  name = "${var.project}-${var.env}-cognito-sns"
  path = "/role/cognito/sns/"
  description = "Role to allow cognito to send messages via SNS"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cognito-idp.amazonaws.com"
        }
        Action =  [
          "sts:AssumeRole"
        ]
        Condition = {
          StringEquals = {
              "sts:ExternalId" = "${var.project}-${var.env}-cognito-snscaller"
          }
        }
      }
    ]
  })

  managed_policy_arns = [aws_iam_policy.sns-publish.arn]
}

# resources for writing console logs to Cloudwatch
resource "aws_iam_user" "console-log-writer" {
  name = "${var.project}-${var.env}-console-log-writer"
}


resource "aws_iam_policy" "console-log-write" {
  name = "${var.project}-${var.env}-cloudwatch-console-write"
  path = "/policy/cloudwatch/console/"
  description = "Allows writing to specific CloudWatch log group"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = [ "${aws_cloudwatch_log_group.console-log-group.arn}:*:*" ]
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "console-log-writer-policy" {
  user = aws_iam_user.console-log-writer.name
  policy_arn = aws_iam_policy.console-log-write.arn
}


resource "aws_iam_access_key" "console-log-writer-key" {
  user = aws_iam_user.console-log-writer.name
}
