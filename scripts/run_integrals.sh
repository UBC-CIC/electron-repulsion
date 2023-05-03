#!/bin/bash
set -ex

while :
do
	message=$(aws sqs receive-message --queue-url $TASK_QUEUE --message-attribute-names batch | jq -r ".Messages[0]")
	if [ -z "$message" ]; 
	then
		sleep 1
	else
		receipt=$(echo $message | jq -r ".ReceiptHandle")
		body=$(echo $message | jq -r ".Body")
		token=$(echo $body | jq -r ".token")
		input=$(echo $body | jq -r ".input")
		input_value=$(echo $input | jq -r ".value")
		attributes=$(echo $message | jq -r ".MessageAttributes")
		batch=$(echo $attributes | jq -r ".batch")
		batch_value=$(echo $batch | jq -r ".StringValue")

		JSON_OUTPUT_PATH=$(echo $input_value | jq -r ".s3_bucket_path")
		commands=$(echo $input_value | jq -r -c ".commands" | sed -e "s/\[//g" -e "s/\]//g" -e "s/\",\"/ /g" -e "s/\"//g")

		./../integrals/integrals $(echo $commands) | tee output.json

		FILE_SIZE=$(wc -c output.json | awk '{print $1}')
		JOBID=`echo $input_value | jq -r ".jobid"`
		if [ $FILE_SIZE == 0 ]
		then
			aws stepfunctions send-task-failure --task-token $token --cause  "NO OUTPUT FILE GENERATED for job $JOBID"
			aws sqs delete-message --queue-url $TASK_QUEUE --receipt-handle $receipt
		fi
		echo $JSON_OUTPUT_PATH
		aws s3 cp output.json $JSON_OUTPUT_PATH
		STATUS=$(jq '.success' output.json)
		if [ $STATUS != "true" ]
		then
			MESSAGE=$(jq '.error' output.json)

			aws stepfunctions send-task-failure --task-token $token --cause $MESSAGE
			aws sqs delete-message --queue-url $TASK_QUEUE --receipt-handle $receipt
		else
			if [ "$batch_value" == "true" ]
			then 
				return=$(aws dynamodb update-item --table-name $BATCH_TABLE --key "{\"jobid\":{\"S\":\"$JOBID\"}}" --update-expression "SET remaining_tasks = remaining_tasks - :incr" --expression-attribute-values '{":incr":{"N":"1"}}' --return-values UPDATED_NEW)
				attr=$(echo $return | jq -r ".Attributes")
				remaining=$(echo $attr | jq -r ".remaining_tasks")
				remain=$(echo $remaining | jq -r ".N")
				if [ $remain == 0 ]
				then
					aws stepfunctions send-task-success --task-token $token --task-output "$input_value"
					aws dynamodb delete-item --table-name $BATCH_TABLE --key "{\"jobid\":{\"S\":\"$JOBID\"}}"
				fi
			else
				aws stepfunctions send-task-success --task-token $token --task-output "$input_value"
			fi
			aws sqs delete-message --queue-url $TASK_QUEUE --receipt-handle $receipt
		fi
	fi
done
