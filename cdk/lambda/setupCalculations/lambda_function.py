import json
import boto3
import os

s3 = boto3.client('s3')
bucket_name = os.environ['ER_S3_BUCKET']

# Takes the list of "commands" as input and returns the name of the basis_set
def get_basis_set(cmds):
    for i in range(len(cmds)):
        if(cmds[i] == '--basis_set'):
            return cmds[i+1]


# Takes the list of "commands" as input and returns the xyz
def get_xyz(cmds):
    for i in range(len(cmds)):
        if(cmds[i] == '--xyz'):
            return cmds[i+1]


def lambda_handler(event, context):
    jobid = event['jobid']
    basis_set = get_basis_set(event['commands'])
    xyz = get_xyz(event['commands'])
    # Gets the stepName introduced in the preceeding Pass state to know which step to setup for
    stepName = event['output']['stepName']
    commands = []
    # core_hamiltonian, overlap, and initial_guess
    if stepName == 'core_hamiltonian' or stepName == 'overlap' or stepName == 'initial_guess':
        commands = [
            stepName,
            '--jobid', jobid,
            '--xyz', xyz,
            '--basis_set', basis_set,
            '--bucket', bucket_name,
            '--output_object', f"job_files/{jobid}/bin_files/{jobid}_{stepName}.bin"
            ]

    # fock_matrix
    elif stepName == 'fock_matrix':
        iter_num = event['loopData']['loopCount']
        # Takes in initial_guess output on first iteration and scf_step (of previous iteration) output on the rest
        density_url_step = 'initial_guess' if iter_num == 1 else f'scf_step_{int(iter_num) - 2}'
        commands = [
                stepName,
                '--xyz', xyz,
                '--basis_set', basis_set,
                '--jobid', jobid,
                '--eri_prefix', jobid,
                '--bucket', bucket_name,
                '--density_url', f"s3://{bucket_name}/job_files/{jobid}/bin_files/{jobid}_{density_url_step}.bin",
                '--output_object',
                # Storing all fock_matrix outputs indexed starting at index 0
                f"job_files/{jobid}/bin_files/{jobid}_fock_matrix_{int(event['loopData']['loopCount']) - 1}.bin"
            ]

    # scf_step
    elif stepName == 'scf_step':
        commands = [
                stepName,
                '--xyz', xyz,
                '--basis_set', basis_set,
                '--jobid', jobid,
                '--bucket', bucket_name,
                '--output_object',
                # Storing all scf_step outputs indexed starting at index 0
                f"job_files/{jobid}/bin_files/{jobid}_scf_step_{int(event['loopData']['loopCount']) - 1}.bin",
                '--fock_matrix_url',
                f"s3://{bucket_name}/job_files/{jobid}/bin_files/{jobid}_fock_matrix_{int(event['loopData']['loopCount']) - 1}.bin",
                '--hamiltonian_url', f"s3://{bucket_name}/job_files/{jobid}/bin_files/{jobid}_core_hamiltonian.bin",
                '--overlap_url', f"s3://{bucket_name}/job_files/{jobid}/bin_files/{jobid}_overlap.bin"
            ]
    # Need to add index to scf and fock JSON outputs as well
    s3_bucket_path = ""
    if stepName in ["scf_step", "fock_matrix"]:
        s3_bucket_path =  f"s3://{bucket_name}/job_files/{jobid}/json_files/{jobid}_{stepName}_{int(event['loopData']['loopCount']) - 1}.json"
    else:
        s3_bucket_path = f"s3://{bucket_name}/job_files/{jobid}/json_files/{jobid}_{stepName}.json"
    return {
        'commands': commands,
        's3_bucket_path': s3_bucket_path,
        'jobid': jobid,
        'max_iter': event['max_iter'],
        'hartree_fock_energy': event['hartree_fock_energy'] if 'hartree_fock_energy' in event else None,
        'loopData': event['loopData'] if 'loopData' in event else None,
        'epsilon': event['epsilon']
    }

