# Description
The terraform files exist to set up most of the resources you will need at AWS in order to run the study software. (The material in the 'lambdas' directory creates the resources that terraform does not.) For this software you will most likely run terraform once to set everything up and not touch it again, though it can be used to modify (or destroy) the resources you create if necessary. In addition to "things won't change much", another assumption is that only one person will be responsible for managing the terraform configuration. If either of those assumptions are false you may want to change the way things are organized here.

The terraform configuration is split into two major parts, represented by the 'main' and 'post-lambda' directories. The resources configured in the 'main' directory are meant to be created first. Next you would deploy the serverless resources - see the README.md file in the 'lambdas' directory. The serverless deployment will create resources that are referenced by the terraform configuration in the 'post-lambda' directory, which is why that part of the terraform configuration has to be run after it.

As with everything else in the application, you can configure terraform to deploy both development and production resources - see Setup below.


# Prerequisites

1. Make sure that you have an [AWS](https://aws.amazon.com/) account set up and the [AWS CLI](https://aws.amazon.com/cli/) installed and configured.

2. Install the [terraform CLI](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli) .

# Setup
If you've just checked out the repository and want to use terraform to create the required AWS resources you'll need to do these things first:

1.  Use [S3](https://s3.console.aws.amazon.com/s3/buckets) to create a bucket where you will store your Terraform state. Edit main.tf to change the bucket name in the `terraform.backend` block to match the name of the bucket you just created.

2. Do a `terraform init` in the main directory. Note that if you are not using the default [AWS profile in your AWS credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html) you will want to set the AWS_PROFILE environment variable first: `export AWS_PROFILE=your-profile-name`

```
cd main
terraform init
```

... and in the post-lambda directory:

```
cd ../post-lambda
terraform init
```

3. Set up your dev and production workspaces:
```
cd ../main
terraform workspace new dev
terraform workspace new prod
cd ../post-lambda
terraform workspace new dev
terraform workspace new prod
```

4. Create a file named `sensitive.tfvars` in the 'main' directory with the following contents:

```
error-notification-emails = "email address that should receive notifications of certain errors from the app"
```

Note that creating the resources for the first time will trigger an email to this address with a link to confirm that you really do want to get the notifications. If you don't click the confirmation link you won't get the notification messages.

5. Check your `dev.tfvars` and `prod.tfvars` files in both the 'main' and 'post-lambda' directories to see if you want to change anything (e.g. project name, aws region) before creating your resources.

# Usage
To create your AWS resources, first do an aws sso login if your credentials might have expired:

```
aws sso login --profile [your profile name]
```

Next, set the AWS_PROFILE environment variable if you're not using the default profile: `export AWS_PROFILE=your-profile-name`

Next, select your workspace:

```
cd main
terraform workspace select dev
````

...then check to see what terraform is going to do before you run it:

```
terraform plan -var-file=dev.tfvars -var-file=sensitive.tfvars
```

If everything looks good, go ahead and create your resources:

```
terraform apply -var-file=dev.tfvars -var-file=sensitive.tfvars
```

The `terraform apply` command will print out a plan much like the one you got from `terraform plan`. Review it again, just to be safe, and continue if it looks good.

Make a note of the output line that starts with `cognito_pool_id = ...` - you will need that id soon.

Once you've deployed your serverless resources (see the README in ../../lambdas) you can return and do one important setup step in the post-lambda directory. You only need to do this step once (unless you destroy and re-create your user pool for some reason).

```
cd post-lambda
terraform import -var-file=dev.tfvars aws_cognito_user_pool.pool [your user pool id]
```

Now you can follow the same steps in the 'post-lambda' directory as you did in the 'main' directory, but commands issued there do not need the '-var-file=sensitive.tfvars' parameter.

```
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```
