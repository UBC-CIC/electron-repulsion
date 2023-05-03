import json
import boto3
import os
from urllib.parse import urlparse

s3 = boto3.client('s3')
sqs = boto3.client('sqs')
dynamo = boto3.client('dynamodb')

bucket_name = os.environ['ER_S3_BUCKET']
queue_url = os.environ['TASK_QUEUE']
batch_table = os.environ['BATCH_TABLE']


# Takes the list of "commands" as input and returns the name of the basis_set
def get_basis_set(cmds):
    for i in range(len(cmds)):
        if (cmds[i] == '--basis_set'):
            return cmds[i+1]


# Takes the list of "commands" as input and returns the xyz
def get_xyz(cmds):
    for i in range(len(cmds)):
        if (cmds[i] == '--xyz'):
            return cmds[i+1]


def lambda_handler(event, context):
    payload = event['payload']
    file_location = urlparse(payload['s3_bucket_path'], allow_fragments=False).path.lstrip('/')
    batch_execution = payload['batch_execution']
    obj = s3.get_object(
        Bucket=bucket_name,
        Key=file_location
    )
    objDict = json.loads(obj['Body'].read())
    jobid = payload['jobid']
    xyz = get_xyz(payload['commands'])
    numSlices = (
        int(payload['num_batch_jobs']) if payload['num_batch_jobs'] is not None
        else objDict['basis_set_instance_size']
        )
    basis_set = get_basis_set(payload['commands'])
    if (objDict['success']):
        commands = []
        if batch_execution == "true":
            dynamo.put_item(
                TableName=batch_table,
                Item={
                    'jobid': {'S': jobid},
                    'remaining_tasks': {'N': str(objDict['basis_set_instance_size'])}
                }
            )
            for i in range(objDict['basis_set_instance_size']):
                commands = [
                        'two_electrons_integrals',
                        '--jobid', jobid,
                        '--xyz', xyz,
                        '--basis_set', basis_set,
                        '--begin', f'{i},0,0,0',
                        '--end', f"{i+1},0,0,0",
                        '--bucket', bucket_name,
                        '--output_object', f"{jobid}_{i}_0_0_0_{i+1}_0_0_0.bin"
                ]
                sqs.send_message(
                    QueueUrl=queue_url,
                    MessageBody=json.dumps({
                        'input': {
                            'value': {
                                'n': objDict['basis_set_instance_size'],
                                'commands': commands,
                                's3_bucket_path': (
                                    f"s3://{bucket_name}/job_files/{jobid}/json_files/"
                                    f"{jobid}_two_electrons_integrals_{i}.json"
                                    ),
                                'numSlices': numSlices,
                                'args_path': f"s3://{bucket_name}/tei_args/{jobid}",
                                'batch_execution': batch_execution,
                                'jobid': jobid,
                                'epsilon': payload['epsilon'],
                            }
                        },
                        'token': event['task_token']}),
                    MessageAttributes={
                        'batch': {
                            'DataType': 'String',
                            'StringValue': 'true'
                        }
                    }
                )

        else:
            # Commands for Sequential
            commands = [
                        'two_electrons_integrals',
                        '--jobid', jobid,
                        '--xyz', xyz,
                        '--basis_set', basis_set,
                        '--begin', '0,0,0,0',
                        '--end', f"{objDict['basis_set_instance_size']},0,0,0",
                        '--bucket', bucket_name,
                        '--output_object', f"{jobid}_0_0_0_0_{objDict['basis_set_instance_size']}_0_0_0.bin"
                        ]
            sqs.send_message(
                    QueueUrl=queue_url,
                    MessageBody=json.dumps({
                        'input': {
                            'value': {
                                'n': objDict['basis_set_instance_size'],
                                'commands': commands,
                                's3_bucket_path': (
                                    f"s3://{bucket_name}/job_files/{jobid}/json_files/"
                                    f"{jobid}_two_electrons_integrals_0.json"
                                    ),
                                'numSlices': numSlices,
                                'args_path': f"s3://{bucket_name}/tei_args/{jobid}",
                                'batch_execution': batch_execution,
                                'jobid': jobid,
                                'epsilon': payload['epsilon'],
                            }
                        },
                        'token': event['task_token']}),
                )
        return payload
    else:
        raise Exception('Info step failed!')
