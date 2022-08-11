#!/bin/bash
set -eu
./../integrals/integrals $@ | tee output.json
aws s3 cp output.json $JSON_OUTPUT_PATH
