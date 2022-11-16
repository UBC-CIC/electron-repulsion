#!/bin/bash

# Pushes the local integrals docker image to ECR
# USE: AWS_PROFILE=... AWS_DEFAULT_REGION=... ./scripts/push_image.sh

set -eux

NAME="integrals-repo"

AWS_CMD="aws"
if [[ ! -z "${AWS_PROFILE:-}" ]]; then
  AWS_CMD="aws --profile ${AWS_PROFILE}"
fi

REPO="$(${AWS_CMD} ecr describe-repositories --repository-names ${NAME} --output text --query repositories[0].repositoryUri)"

set +x

PASSWORD="$(${AWS_CMD} ecr get-login-password)"

docker login --username AWS --password ${PASSWORD} ${REPO}

set -x

docker image tag integrals:latest ${REPO}

docker push ${REPO}
