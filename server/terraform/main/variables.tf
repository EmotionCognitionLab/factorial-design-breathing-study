variable "region" {
    description = "The AWS region where the infrastructure should be deployed."
}

variable "env" {
    description = "Defines the environment (e.g. dev, QA, production) this infrastructure is intended for."
}

variable "project" {
    description = "The name of the project. Should be short, as it is used as a prefix for most resources."
}

variable "cognito-callback-urls" {
    description = "The list of urls the user may be redirected to after authentication. Must be absolute and must be https unless it is localhost."
}

variable "cognito-logout-url" {
    description = "The url the user is redirected to after signing out."
}

variable "cognito-redirect-uri" {
  description = "The URL to which cognito redirects the browser after authorization. Must be absolute and must be https unless it is localhost."
}

variable "error-notification-emails" {
    description = "Space-separated list of email addresses for recipients of console errors"
    sensitive = true
}

variable "redcap-inbound-token" {
    description = "Token sent by REDCap to us"
    sensitive = true
}

variable "data-bucket" {
    description =  "S3 bucket for participant data"
}

variable "report-recipients" {
    description = "Recipients of the user condition report"
}
