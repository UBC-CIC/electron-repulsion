#!/bin/bash
# Both of these must be set for a batch job
if [ ! -z $ARGS_PATH ] && [ ! -z $AWS_BATCH_JOB_ARRAY_INDEX ]
then
    aws s3 cp $ARGS_PATH/batch_args.txt /args.txt
    LINE=$((AWS_BATCH_JOB_ARRAY_INDEX + 1))
    COMMAND=$(sed -n ${LINE}p /args.txt)
    ./../integrals/integrals $@ $COMMAND | tee output.json
    aws s3 cp output.json $JSON_OUTPUT_PATH
else
    ./../integrals/integrals $@ | tee output.json
    # TODO: Add check if JSON_OUTPUT_PATH starts with "s3://"
    aws s3 cp output.json $JSON_OUTPUT_PATH
fi
