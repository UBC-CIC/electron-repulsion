#!/bin/bash
# If AWS_BATCH_JOB_INDEX is set, it means execution is an array batch execution
if [ ! -z $AWS_BATCH_JOB_ARRAY_INDEX ]
then
    aws s3 cp $ARGS_PATH/batch_args.txt /args.txt
    ADJ_LINE=$((AWS_BATCH_JOB_ARRAY_INDEX + $LINE))
    COMMAND=$(sed -n ${ADJ_LINE}p /args.txt)
    ./../integrals/integrals $@ $COMMAND | tee output.json
    TO_REPLACE="#JOB_NUMBER"
    REPLACEMENT="_${ADJ_LINE-1}"
    NEW_JSON_PATH="${JSON_OUTPUT_PATH/"$TO_REPLACE"/"$REPLACEMENT"}"
    echo $NEW_JSON_PATH
    aws s3 cp output.json $NEW_JSON_PATH
elif [ ! -z $LINE ] # If LINE is set but not AWS_BATCH_JOB_INDEX, we are executing a single remaining execution on ECS
then
    aws s3 cp $ARGS_PATH/batch_args.txt /args.txt
    COMMAND=$(sed -n ${LINE}p /args.txt)
    ./../integrals/integrals $@ $COMMAND | tee output.json
    TO_REPLACE="#JOB_NUMBER"
    REPLACEMENT="_${LINE-1}"
    NEW_JSON_PATH="${JSON_OUTPUT_PATH/"$TO_REPLACE"/"$REPLACEMENT"}"
    echo $NEW_JSON_PATH
    aws s3 cp output.json $NEW_JSON_PATH
else
    ./../integrals/integrals $@ | tee output.json
    # TODO: Add check if JSON_OUTPUT_PATH starts with "s3://"
    aws s3 cp output.json $JSON_OUTPUT_PATH
fi
