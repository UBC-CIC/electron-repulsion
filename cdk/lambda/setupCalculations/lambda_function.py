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
            '--output_object', f"job_files/{jobid}/bin_files/{jobid}_{stepName}.bin"
            ]

    elif stepName == 'fock_matrix':
        iter_num = event['loopData']['loopCount']
        density_url_step = 'initial_guess' if iter_num == 1 else 'scf_step'
        commands = [
                stepName,
                '--xyz', xyz,
                '--basis_set', basis_set,
                '--jobid', jobid,
                '--eri_prefix', jobid,
                '--bucket', bucket_name,
                '--density_url', f"s3://{bucket_name}/job_files/{jobid}/bin_files/{jobid}_{density_url_step}.bin",
                '--output_object', f"job_files/{jobid}/bin_files/{jobid}_fock_matrix.bin"
            ]
    elif stepName == 'scf_step':
        commands = [
                stepName,
                '--xyz', xyz,
                '--basis_set', basis_set,
                '--jobid', jobid,
                '--bucket', bucket_name,
                '--output_object', f"job_files/{jobid}/bin_files/{jobid}_scf_step.bin",
                '--fock_matrix_url', f"s3://{bucket_name}/job_files/{jobid}/bin_files/{jobid}_fock_matrix.bin",
                '--hamiltonian_url', f"s3://{bucket_name}/job_files/{jobid}/bin_files/{jobid}_core_hamiltonian.bin",
                '--overlap_url', f"s3://{bucket_name}/job_files/{jobid}/bin_files/{jobid}_overlap.bin"
            ]
    return {
        'commands': commands,
        's3_bucket_path': f"s3://{bucket_name}/job_files/{jobid}/json_files/{jobid}_{stepName}.json",
        'jobid': jobid,
        'max_iter': event['max_iter'],
        'hartree_fock_energy': event['hartree_fock_energy'] if 'hartree_fock_energy' in event else None,
        'loopData': event['loopData'] if 'loopData' in event else None,
        'epsilon': event['epsilon']
    }

