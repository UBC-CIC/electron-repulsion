import json
import boto3
import os

s3 = boto3.client('s3')
bucket_name = os.environ['ER_S3_BUCKET']

def get_basis_set(cmds):
    for i in range(len(cmds)):
        if(cmds[i] == '--basis_set'):
            return cmds[i+1]

def get_xyz(cmds):
    for i in range(len(cmds)):
        if(cmds[i] == '--xyz'):
            return cmds[i+1]

def lambda_handler(event, context):
    print(event)
    jobid = event['jobid']
    basis_set = get_basis_set(event['commands'])
    xyz = get_xyz(event['commands'])
    stepName = event['output']['stepName']
    commands = [
            stepName,
            '--jobid', jobid,
            '--xyz', xyz,
            '--basis_set', basis_set,
            '--bucket', bucket_name,
            '--output_object', f"{jobid}_{stepName}.bin"
            ]
    return {
        'commands': commands,
        's3_bucket_path': f"s3://{bucket_name}/{stepName}/{jobid}.json"
    }

