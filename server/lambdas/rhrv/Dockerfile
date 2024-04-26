FROM public.ecr.aws/lambda/provided:latest-arm64

RUN  dnf -y install R-core \
    && dnf -y install R-devel \
    && dnf -y install openssl-devel \
    && dnf -y install libcurl-devel

RUN Rscript -e "install.packages(c('httr', 'jsonlite', 'logger', 'RHRV', 'pracma'), repos = 'https://cloud.r-project.org/')"

RUN dnf remove -y R-devel \
    && dnf -y remove openssl-devel \
    && dnf -y remove libcurl-devel \
    && dnf clean all

COPY runtime.R functions.R ${LAMBDA_TASK_ROOT}/
RUN chmod 755 -R ${LAMBDA_TASK_ROOT}/

COPY bootstrap.sh /var/runtime/bootstrap
RUN chmod +x /var/runtime/bootstrap
