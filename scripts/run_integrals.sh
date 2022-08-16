#!/bin/bash
set -eu
./../integrals/integrals $@ | tee output.json

# TODO: Add check if JSON_OUTPUT_PATH starts with "s3://"
aws s3 cp output.json $JSON_OUTPUT_PATH
