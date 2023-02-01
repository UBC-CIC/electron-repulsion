#!/bin/bash

# Builds and tags the integrals docker image locally
# USE: ./scripts/build_image.sh

set -eux

docker buildx build --platform linux/amd64 . -t integrals:latest
