variable "region" {
    description = "The AWS region where the infrastructure should be deployed."
}

variable "env" {
    description = "Defines the environment (e.g. dev, QA, production) this infrastructure is intended for."
}

variable "project" {
    description = "The name of the project. Should be short, as it is used as a prefix for most resources."
}
