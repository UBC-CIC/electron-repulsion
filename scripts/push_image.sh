#!/bin/bash

# Pushes the local integrals docker image to ECR
# USE: ./scripts/build_image.sh

set -eux

# TODO(ejconlon) Use the correct name here
NAME="integrals-repo"
TAG="latest"

AWS_CMD="aws"
if [[ ! -z "${AWS_PROFILE}" ]]; then
  AWS_CMD="aws --profile ${AWS_PROFILE}"
fi

REPO="$(${AWS_CMD} ecr describe-repositories --repository-names ${NAME} --output text --query repositories[0].repositoryUri)"

PASSWORD="$(${AWS_CMD} ecr get-login-password)"

docker login --username AWS --password ${PASSWORD} ${REPO}

docker tag ${TAG} ${REPO}

docker push ${REPO}
