#!/bin/bash
# Both of these must be set for a batch job
free -h
if [ ! -z $ARGS_PATH ] && [ ! -z $AWS_BATCH_JOB_ARRAY_INDEX ]
then
    aws s3 cp $ARGS_PATH/batch_args.txt /args.txt
    LINE=$((AWS_BATCH_JOB_ARRAY_INDEX + 1))
    COMMAND=$(sed -n ${LINE}p /args.txt)
    ./../integrals/integrals $@ $COMMAND | tee output.json
    TO_REPLACE="#JOB_NUMBER"
    REPLACEMENT="_${AWS_BATCH_JOB_ARRAY_INDEX}"
    NEW_JSON_PATH="${JSON_OUTPUT_PATH/"$TO_REPLACE"/"$REPLACEMENT"}"
    JSON_OUTPUT_PATH=$NEW_JSON_PATH
else
    ./../integrals/integrals $@ | tee output.json
fi
FILE_SIZE=$(wc -c output.json | awk '{print $1}')
if [ $FILE_SIZE == 0 ]
then
    echo "NO OUTPUT FILE GENERATED"
    exit 1
fi
echo $JSON_OUTPUT_PATH
aws s3 cp output.json $JSON_OUTPUT_PATH
STATUS=$(jq '.success' output.json)
if [ $STATUS != "true" ]
then
    echo "TASK FAILED"
    MESSAGE=$(jq '.error' output.json)
    echo $MESSAGE
    exit 1
fi
