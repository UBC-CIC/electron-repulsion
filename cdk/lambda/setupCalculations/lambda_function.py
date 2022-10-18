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
    commands = []
    if stepName == 'core_hamiltonian' or stepName == 'overlap' or stepName == 'initial_guess':
        commands = [
            stepName,
            '--jobid', jobid,
            '--xyz', xyz,
            '--basis_set', basis_set,
            '--bucket', bucket_name,
            '--output_object', f"{stepName}_bin_files/{jobid}_{stepName}.bin"
            ]

    elif stepName == 'fock_matrix':
        commands = [
                stepName,
                '--xyz', xyz,
                '--basis_set', basis_set,
                '--jobid', jobid,
                '--eri_prefix', jobid,
                '--bucket', bucket_name,
                '--density_url', f"https://{bucket_name}.s3.{os.environ['AWS_REGION']}.amazonaws.com/initial_guess_bin_files/{jobid}_initial_guess.bin",
                '--output_object', f"fock_matrix_bin_files/{jobid}_fock_matrix.bin"
            ]

    return {
        'commands': commands,
        's3_bucket_path': f"s3://{bucket_name}/{stepName}/{jobid}.json",
        'jobid': jobid
    }

