import json
import boto3
import os
from urllib.parse import urlparse

dynamo = boto3.client('dynamodb')

deleted_job_table = os.environ['DELETED_JOB_TABLE']
batch_table = os.environ['BATCH_TABLE']


def lambda_handler(event, context):
    jobid = event['jobid']
    try:
        dynamo.put_item(
            TableName=deleted_job_table,
            Item={
                'jobid': {'S': jobid},
            }
        )
        dynamo.delete_item(
            TableName=batch_table,
            Key={
                'jobid': {'S': jobid}
            }
        )
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "jobid ": jobid,
            })
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "jobid ": jobid,
                "error": str(e)
            })
        }