import json
import boto3
import os

dynamo = boto3.client("dynamodb")

deleted_job_table = os.environ["DELETED_JOB_TABLE"]
batch_table = os.environ["BATCH_TABLE"]


def verify_inputs(event):
    if "jobid" not in event:
        raise Exception("jobid is required")


def lambda_handler(event, context):
    verify_inputs(event)
    jobid = event["jobid"]
    dynamo.put_item(
        TableName=deleted_job_table,
        Item={
            "jobid": {"S": jobid},
        },
    )
    dynamo.delete_item(TableName=batch_table, Key={"jobid": {"S": jobid}})
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(
            {
                "jobid ": jobid,
            }
        ),
    }
