#!/bin/bash

# Builds and tags the integrals docker image locally
# USE: ./scripts/build_image.sh

set -eux

docker build . -t integrals:latest
