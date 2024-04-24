# Description
The files in this directory are for building a [lambda layer](https://aws.amazon.com/about-aws/whats-new/2018/11/aws-lambda-now-supports-custom-runtimes-and-layers/) that provides [better-sqlite3](https://github.com/JoshuaWise/better-sqlite3). This allows multiple different lambda functions to make use of better-sqlite3 without each one having to build it and incorporate it directly. Thanks to Sean Fisher's [better-sqlite3-lambda-layer](https://github.com/seanfisher/better-sqlite3-lambda-layer) for showing the way.

You should only need to build this once - after that you can leave it alone. (Unless you want to upgrade the node version, the better-sqlite3 version, you check out the repo again, etc.)

# Prerequisites
 * [Docker](https://www.docker.com)
 * [Git](https://git-scm.com/)

# Setup
1. First, make sure that you're in some other directory, not in this one. We'll pretend that you're going to do this in /my/code/. Clone the [aws-lambda-base-images](https://github.com/aws/aws-lambda-base-images) repository:
```
cd /my/code/
git clone https://github.com/aws/aws-lambda-base-images.git
```
2. Checkout the branch for the version of nodejs that you want to use. Here we're using nodejs 20.x. Note that if you use another version you'll need to modify the build.sh script in this directory to refer to the tag you use when building the docker image in step 3 and to modify the ../serverless.yml file to change the compatibleRuntimes parameter in the BetterSqlite3 layer.
```
cd aws-lambda-base-images
git checkout nodejs20.x
```
3. Build the aws docker image:
```
docker build --platform="linux/amd64" -t lambda-docker:20.x -f Dockerfile.nodejs20.x .
```
Note that we've tagged it "lambda-docker:20.x" to indicate that it uses nodejs 20.x. That's what you'll need to change in the build.sh file and the serverless.yml file if you use a different version.

4. Come back to this directory and build the layer:
```
cd /my/code/fd-breath-study/server/lambdas/better-sqlite3-layer/
./build.sh
```

