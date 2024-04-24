FROM amazon/aws-lambda-nodejs:18
RUN yum update -y && yum install -y \
  python3 \
  make \
  gcc \
  gcc-c++
ENTRYPOINT ["/bin/sh", "-c"]

