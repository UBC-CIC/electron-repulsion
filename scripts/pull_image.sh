#!/bin/bash

# Pulls the ECR integrals docker image to local
# USE: ./scripts/pull_image.sh

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

docker pull ${REPO}

docker tag ${REPO} integrals:latest
