
# cognito setup
# do not change this without also changing it
# in ../post-lambdas/cognito.tf
resource "aws_cognito_user_pool" "pool" {
    name = "${var.project}-${var.env}-users"
    password_policy {
      minimum_length = 12
    }
    account_recovery_setting {
      recovery_mechanism {
        name = "verified_phone_number"
        priority = 1
      }
    }
    user_attribute_update_settings {
      attributes_require_verification_before_update = ["phone_number"]
    }
    auto_verified_attributes = ["phone_number"]
    schema {
      attribute_data_type = "String"
      name = "phone_number"
      required = true
      mutable = true
      string_attribute_constraints {
          min_length = 12
          max_length = 12
      }
    }
    schema {
      attribute_data_type = "String"
      name = "name"
      required = true
      mutable = true
      string_attribute_constraints {
          min_length = 1
          max_length = 50
      }
    }
    schema {
      attribute_data_type = "String"
      name = "profile"
      required = false
      mutable = false
      string_attribute_constraints {
        min_length = 1
        max_length = 50
      }
    }
    username_attributes = [ "phone_number" ]
    username_configuration {
      case_sensitive = false
    }
    email_configuration {
      email_sending_account = "COGNITO_DEFAULT"
    }
    sms_configuration {
      external_id = "${var.project}-${var.env}-cognito-snscaller"
      sns_caller_arn = aws_iam_role.cognito-sns.arn
    }
    lifecycle {
      ignore_changes = [ password_policy, schema, lambda_config ]
    }
}
output "cognito_pool_id" {
    value = aws_cognito_user_pool.pool.id
}

# save user pool arn to SSM so serverless can reference it
resource "aws_ssm_parameter" "cognito-user-pool-arn" {
  name = "/${var.project}/${var.env}/info/cognito/user-pool/arn"
  description = "Cognito user pool ARN"
  type = "SecureString"
  value = "${aws_cognito_user_pool.pool.arn}"
}

# save user pool id to SSM so serverless can reference it
resource "aws_ssm_parameter" "cognito-user-pool-id" {
  name = "/${var.project}/${var.env}/info/cognito/user-pool/id"
  description = "Cognito user pool id"
  type = "SecureString"
  value = "${aws_cognito_user_pool.pool.id}"
}

resource "aws_cognito_user_pool_client" "client" {
    name = "client"
    user_pool_id = aws_cognito_user_pool.pool.id
    generate_secret = false
    allowed_oauth_flows = [ "code", "implicit" ]
    allowed_oauth_flows_user_pool_client = true
    allowed_oauth_scopes = [ "openid", "aws.cognito.signin.user.admin" ]
    callback_urls = "${var.cognito-callback-urls}"
    default_redirect_uri = "${var.cognito-redirect-uri}"
    logout_urls = "${var.cognito-logout-url}"
    supported_identity_providers = [ "COGNITO" ]
    read_attributes = ["email", "name", "phone_number", "phone_number_verified", "profile"]
    write_attributes = ["email", "name", "phone_number", "profile"]
}
output "cognito_pool_client_id" {
    value = aws_cognito_user_pool_client.client.id
}

# save user pool client id to SSM so serverless can reference it
resource "aws_ssm_parameter" "cognito-user-pool-client-id" {
  name = "/${var.project}/${var.env}/info/cognito/user-pool/client/id"
  description = "Cognito user pool client id"
  type = "SecureString"
  value = "${aws_cognito_user_pool_client.client.id}"
}

resource "aws_cognito_user_pool_domain" "main" {
    domain = "${var.project}-${var.env}"
    user_pool_id = aws_cognito_user_pool.pool.id
}

resource "aws_cognito_identity_pool" "main" {
  allow_classic_flow               = false
  allow_unauthenticated_identities = false
  identity_pool_name               = "${var.project}_${var.env}_id_pool"

  cognito_identity_providers {
      client_id               = "${aws_cognito_user_pool_client.client.id}"
      provider_name           = "${aws_cognito_user_pool.pool.endpoint}"
      server_side_token_check = false
  }
}
output "cognito_identity_pool_id" {
  value = aws_cognito_identity_pool.main.id
}

resource "aws_cognito_user_group" "admin" {
  name = "admin"
  user_pool_id = aws_cognito_user_pool.pool.id
  description = "User group for study administrators"
  precedence = 1
  role_arn = aws_iam_role.study-admin.arn
}

resource "aws_cognito_identity_pool_roles_attachment" "main" {
  identity_pool_id = aws_cognito_identity_pool.main.id

  roles = {
    "authenticated" = aws_iam_role.user-data-reader-writer.arn
    "unauthenticated" = aws_iam_role.unauthenticated.arn
  }
}