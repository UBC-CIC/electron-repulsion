import json
import boto3
import os
import math
from urllib.parse import urlparse

s3 = boto3.client('s3')
bucket_name = os.environ['ER_S3_BUCKET']


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


# Helper function: Add toAdd to a position of indices, used in creating splits
# Eg: If pos = [0,0,0,0], n = 5, toAdd = 6, then [0,0,1,1] is returned
def addToPosition(pos, toAdd, n):
    retPos = pos[:]  # A copy of original list
    tens = n
    hundreds = n**2
    thousands = n**3
    while toAdd > 0:
        if toAdd >= thousands:
            retPos[0] += 1
            toAdd -= thousands
        elif toAdd >= hundreds:
            retPos[1] += 1
            toAdd -= hundreds
            if retPos[1] >= n:
                retPos[1] = 0
                retPos[0] += 1
        elif toAdd >= tens:
            retPos[2] += 1
            toAdd -= tens
            if retPos[2] >= n:
                retPos[2] = 0
                retPos[1] += 1
                if retPos[1] >= n:
                    retPos[1] = 0
                    retPos[0] += 1
        else:
            retPos[3] += 1
            toAdd -= 1
            if retPos[3] >= n:
                retPos[3] = 0
                retPos[2] += 1
                if retPos[2] >= n:
                    retPos[2] = 0
                    retPos[1] += 1
                    if retPos[1] >= n:
                        retPos[1] = 0
                        retPos[0] += 1
    return retPos


def listToString(indices):
    return f"{indices[0]}, {indices[1]}, {indices[2]}, {indices[3]}"


# Generates arguments (for use by the containers) for the Batch job and sequential
# job and stores them on S3 as a text file
# Divides a n * n * n * n matrix into numSlices subtasks for Batch
def writeArgsToS3(n, jobid, numSlices):
    fileNameSeq = "seq_args.txt"
    fileNameBatch = "batch_args.txt"
    # Sequential file
    seq_args = f"--begin 0,0,0,0 --end {n},0,0,0 --output_object {jobid}_0_0_0_0_{n}_0_0_0.bin"
    with open('/tmp/' + fileNameSeq, 'w+') as file:
        file.write(seq_args)
        file.close()

    # Batch File
    numIntegrals = n**4  # 4D Matrix
    start = [0, 0, 0, 0]
    batchSize = int(numIntegrals/numSlices)
    batch_args = ""
    i = numSlices
    while i > 1:
        i -= 1
        end = addToPosition(start, batchSize, n)
        batch_args += (
            f"--begin {listToString(start)} --end {listToString(end)} --output_object "
            f"{jobid}_{start[0]}_{start[1]}_{start[2]}_{start[3]}_{end[0]}_{end[1]}_{end[2]}_{end[3]}.bin\n"
            )
        start = end[:]
    batch_args += (
        f"--begin {listToString(start)} --end {n},0,0,0 --output_object "
        f"{jobid}_{start[0]}_{start[1]}_{start[2]}_{start[3]}_{n}_0_0_0.bin"
    )
    with open('/tmp/' + fileNameBatch, 'w+') as file:
        file.write(batch_args)
        file.close()
    s3.upload_file('/tmp/' + fileNameSeq, bucket_name, f"tei_args/{jobid}/{fileNameSeq}")
    s3.upload_file('/tmp/' + fileNameBatch, bucket_name, f"tei_args/{jobid}/{fileNameBatch}")


# Find split size so that each input size to batch is approximately 512 MB
def getNumSlices(n):
    MAX_NUM_VALUES_PER_MATRIX_ELEMENT = 128
    # Total number of values = numValues = AVG_NUM_VALUES_PER_MATRIX_ELEMENT*n^4
    numValues = MAX_NUM_VALUES_PER_MATRIX_ELEMENT * n**4
    # Size of 1 value = 8 bytes
    # Size of all values total = totalSize = numValues*8
    totalSize = numValues * 8
    # For a SPLIT_SIZE MB split size
    SPLIT_SIZE = 512  # In MB
    # Number of batch jobs = totalSize / (SPLIT_SIZE*1,000,000)
    numJobs = float(totalSize) / SPLIT_SIZE / 1000000
    return int(math.ceil(numJobs))  # Keeping max less than 512 MB


def lambda_handler(event, context):
    file_location = urlparse(event['s3_bucket_path'], allow_fragments=False).path.lstrip('/')
    batch_execution = event['batch_execution']
    obj = s3.get_object(
        Bucket=bucket_name,
        Key=file_location
    )
    objDict = json.loads(obj['Body'].read())
    jobid = event['jobid']
    xyz = get_xyz(event['commands'])
    numSlices = (
        int(event['num_batch_jobs']) if event['num_batch_jobs'] is not None
        else getNumSlices(objDict['basis_set_instance_size'])
        )
    basis_set = get_basis_set(event['commands'])
    if (objDict['success']):
        writeArgsToS3(objDict['basis_set_instance_size'], jobid, numSlices)
        commands = []
        if batch_execution == "true" and numSlices > 1:
            # Commands for Batch
            commands = [
                        'two_electrons_integrals',
                        '--jobid', jobid,
                        '--xyz', xyz,
                        '--basis_set', basis_set,
                        '--bucket', bucket_name
                        ]
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
        # In case of Batch, the Lambda formats the JSON output as <jobid>_two_electrons_integrals#JOB_NUMBER.json
        # The #JOB_NUMBER gets replaced in the container shell script by the actual Batch job number (eg. 0,1,2,...)
        # If it is not a batch job, there is only one job - job number 0
        placeholder = "#JOB_NUMBER" if batch_execution == "true" and numSlices > 1 else "_0"
        return {
                'n': objDict['basis_set_instance_size'],
                'commands': commands,
                's3_bucket_path': (
                    f"s3://{bucket_name}/job_files/{jobid}/json_files/"
                    f"{jobid}_two_electrons_integrals{placeholder}.json"
                    ),
                'numSlices': numSlices,
                'args_path': f"s3://{bucket_name}/tei_args/{jobid}",
                'batch_execution': batch_execution,
                'jobid': jobid,
                'epsilon': event['epsilon']
        }
    else:
        raise Exception('Info step failed!')
