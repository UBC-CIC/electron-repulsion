#!/bin/bash

# Deletes the integrals image from ECR. (Needs to be done for a full CDK destroy.)
# USE: AWS_PROFILE=... AWS_DEFAULT_REGION=... ./scripts/delete_image.sh

set -eux

NAME="integrals-repo"

AWS_CMD="aws"
if [[ ! -z "${AWS_PROFILE:-}" ]]; then
  AWS_CMD="aws --profile ${AWS_PROFILE}"
fi

${AWS_CMD} ecr batch-delete-image --repository-name ${NAME} --image-ids imageTag=latest
