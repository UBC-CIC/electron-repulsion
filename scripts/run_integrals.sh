#!/bin/bash
# Both of these must be set for a batch job
if [ ! -z $ARGS_PATH ] && [ ! -z $AWS_BATCH_JOB_ARRAY_INDEX ]
then
    aws s3 cp $ARGS_PATH/batch_args.txt /args.txt
    LINE=$((AWS_BATCH_JOB_ARRAY_INDEX + 1))
    COMMAND=$(sed -n ${LINE}p /args.txt)
    ./../integrals/integrals $@ $COMMAND | tee output.json
    TO_REPLACE="#JOB_NUMBER"
    REPLACEMENT="_${AWS_BATCH_JOB_ARRAY_INDEX}"
    NEW_JSON_PATH="${JSON_OUTPUT_PATH/"$TO_REPLACE"/"$REPLACEMENT"}"
    echo $NEW_JSON_PATH
    aws s3 cp output.json $NEW_JSON_PATH
else
    ./../integrals/integrals $@ | tee output.json
    # TODO: Add check if JSON_OUTPUT_PATH starts with "s3://"
    aws s3 cp output.json $JSON_OUTPUT_PATH
fi
