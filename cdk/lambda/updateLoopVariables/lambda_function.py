import json
import boto3
import os

s3 = boto3.client('s3')
bucket_name = os.environ['ER_S3_BUCKET']

def lambda_handler(event, context):
    scf_output_json = s3.get_object(
            Bucket=bucket_name,
            Key=f"scf_step/{event['jobid']}.json"
        )
    scf_output = json.loads(scf_output_json['Body'].read())
    hartree_fock_energy = scf_output['hartree_fock_energy']
    diff = 1
    if(event['hartree_fock_energy']):
        diff = abs(hartree_fock_energy - event['hartree_fock_energy'])
    loopData = event['loopData']
    loopData['loopCount'] = loopData['loopCount'] + 1
    loopData['hartree_diff'] = diff
    return {
        'jobid': event['jobid'],
        's3_bucket_path': event['s3_bucket_path'],
        'max_iter': event['max_iter'],
        'commands': event['commands'],
        'hartree_fock_energy': hartree_fock_energy,
        'loopData': loopData
    }
