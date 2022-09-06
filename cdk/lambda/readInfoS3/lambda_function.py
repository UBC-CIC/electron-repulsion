import json
import boto3

s3 = boto3.client('s3')

def get_basis_set(cmds):
    for i in range(len(cmds)):
        if(cmds[i] == '--basis_set'):
            return cmds[i+1]

def get_xyz(cmds):
    for i in range(len(cmds)):
        if(cmds[i] == '--xyz'):
            return cmds[i+1]

# Add toAdd to a position of indices, used in creating splits
def addToPosition(pos,toAdd,n):
    retPos = pos[:] # A copy of original list
    print(f"toAdd: {toAdd}")
    while toAdd>0:
        toAdd-=1
        retPos[3]+=1
        if retPos[3] == n:
            retPos[3] = 0
            retPos[2]+=1
            if retPos[2] == n:
                retPos[2] = 0
                retPos[1]+=1
                if retPos[1] == n:
                    retPos[1] = 0
                    retPos[0]+=1
        print(retPos)
    return retPos

def listToString(indices):
    return f"{indices[0]},{indices[1]},{indices[2]},{indices[3]}"


# Currently number of slices set to two, returns True if arguments generated successfully, else False
def writeArgsToS3(n,jobid,numSlices):
    fileNameSeq = f"seq_args.txt"
    fileNameBatch = f"batch_args.txt"
    # Sequential file
    seq_args = f"--begin 0,0,0,0 --end {n},0,0,0 --output_object {jobid}_0_0_0_0_{n}_0_0_0.bin"
    with open('/tmp/' + fileNameSeq, 'w+') as file:
        file.write(seq_args)
        file.close()

    # Batch File
    numIntegrals = n**4 # 4D Matrix
    start = [0,0,0,0]
    batchSize = int(numIntegrals/numSlices)
    batch_args = ""
    i = numSlices
    while i>1:
        i-=1
        end = addToPosition(start,batchSize,n)
        batch_args += f"--begin {listToString(start)} --end {listToString(end)} --output_object {jobid}_{start[0]}_{start[1]}_{start[2]}_{start[3]}_{end[0]}_{end[1]}_{end[2]}_{end[3]}.bin\n"
        start = end[:]
    batch_args += f"--begin {listToString(start)} --end {n},0,0,0 --output_object {jobid}_{start[0]}_{start[1]}_{start[2]}_{start[3]}_{n}_0_0_0.bin"
    with open('/tmp/' + fileNameBatch, 'w+') as file:
        file.write(batch_args)
        file.close()
    try:
        s3.upload_file('/tmp/'+ fileNameSeq, 'integrals-bucket', f"tei_args/{jobid}/{fileNameSeq}");
        s3.upload_file('/tmp/'+ fileNameBatch, 'integrals-bucket', f"tei_args/{jobid}/{fileNameBatch}")
    except Exception as e:
        print(e)
        return False
    return True

def lambda_handler(event, context):
    file_location = event['Overrides']['ContainerOverrides'][0]['Environment'][0]['Value'].replace('s3://integrals-bucket/','')
    numSlices = 6   # Change numSlices here
    obj = s3.get_object(
        Bucket='integrals-bucket',
        Key=file_location
    )
    objDict = json.loads(obj['Body'].read())
    jobid = 'randomPlaceholder' # Put jobid here
    if(objDict['success']):
        writeArgsToS3(objDict['basis_set_instance_size'],jobid,numSlices)
        batch_execution = event['Overrides']['ContainerOverrides'][0]['Environment'][1]['Value']
        commands = []
        if batch_execution == "true":
            commands = [
                        'two_electrons_integrals',
                        '--jobid', jobid,
                        '--xyz', get_xyz(event['Overrides']['ContainerOverrides'][0]['Command']),
                        '--basis_set', get_basis_set(event['Overrides']['ContainerOverrides'][0]['Command']),
                        '--bucket','integrals-bucket'
                        ]
        else:
            commands = [
                        'two_electrons_integrals',
                        '--jobid', jobid,
                        '--xyz', get_xyz(event['Overrides']['ContainerOverrides'][0]['Command']),
                        '--basis_set', get_basis_set(event['Overrides']['ContainerOverrides'][0]['Command']),
                        '--begin', '0,0,0,0',
                        '--end', f"{objDict['basis_set_instance_size']},0,0,0",
                        '--bucket','integrals-bucket',
                        '--output_object',f"{jobid}-integrals.bin"
                        ]
        return {
            'statusCode': 200,
            'inputs':
                {
                    'n': objDict['basis_set_instance_size'],
                    'commands': commands,
                    's3_bucket': f"s3://integrals-bucket/two_electrons_integrals/${jobid}_tei.json",
                    'batch_execution': batch_execution,
                    'numSlices': numSlices,
                    'args_path': 's3://integrals-bucket/tei_args/' + jobid
                }
        }
    else:
        return{
            'statusCode': 400,
            'body': 'Something went wrong...'
        }


