import json
import boto3
import os

s3 = boto3.client('s3')
bucket_name = os.environ['ER_S3_BUCKET']


def lambda_handler(event, context):
    jobid = event['jobid']
    loopData = event['loopData']
    # Getting the recent SCF output (current iteration) from S3
    scf_output_json = s3.get_object(
            Bucket=bucket_name,
            Key=f"job_files/{jobid}/json_files/{jobid}_scf_step_{loopData['loopCount'] - 1}.json"
        )
    scf_output = json.loads(scf_output_json['Body'].read())
    hartree_fock_energy = scf_output['hartree_fock_energy']
    # Previous value of hartree_diff (used in case of first loop execution else overwritten in the next if block)
    diff = event['loopData']['hartree_diff']
    if (event['hartree_fock_energy']):
        diff = abs(hartree_fock_energy - event['hartree_fock_energy'])
    # Update loopData with new values
    loopData['loopCount'] = loopData['loopCount'] + 1
    loopData['hartree_diff'] = diff
    return {
        'jobid': jobid,
        's3_bucket_path': event['s3_bucket_path'],
        'max_iter': event['max_iter'],
        'commands': event['commands'],
        'hartree_fock_energy': hartree_fock_energy,
        'loopData': loopData,
        'epsilon': event['epsilon']
    }
