
#!/usr/bin/env python3


import click
import uuid
from helpers import *
from datetime import datetime


@click.group()
def cli():
    pass

@cli.command()
@click.option('--xyz',help="URL to xyz file",required=True)
@click.option('--basis_set',help="Basis set to be used",required=True)
def info(xyz,basis_set):
    click.echo("Getting resources...")
    aws_resources = resolve_resource_config()
    click.echo("Starting task info...")
    job_id = str(uuid.uuid4())
    path = 'info/' + job_id + '-info.json'
    response = run_ecs_task(
        ["info","--xyz",xyz,"--basis_set",basis_set],
        aws_resources.bucket_uri + path,
        aws_resources
        )

    click.echo("Started task. Waiting for task to finish...")
    wait_for_task(response["tasks"][0]['taskArn'],aws_resources)
    jsonFile = get_json_from_bucket(path)
    print(jsonFile['basis_set_instance_size'])


@cli.command()
@click.option('--xyz',help="URL to xyz file",required=True)
@click.option('--basis_set',help="Basis set to be used",required=True)
@click.option('--jobid',help="Unique Job Id",required=True)
@click.option('--bucket',help="Bucket to send output to",required=True)
@click.option('--output_object',help="Object name to write output to",required=False)
@click.option('--begin',help="Index to begin calculation at",required=False)
@click.option('--end',help="Index to end calculation at",required=False)
def two_electrons_integrals(xyz,basis_set,jobid,bucket,output_object,begin,end):
    click.echo("Getting resources...")
    aws_resources = resolve_resource_config()
    click.echo("Starting task two_electrons_integrals...")
    path = 'two_electrons_integrals/' + jobid + '-tei.json'
    commands = [
            "two_electrons_integrals",
            "--xyz",xyz,
            "--basis_set",basis_set,
            "--jobid",jobid,
            "--bucket",bucket,
            "--output_object",output_object,
            "--begin",begin,
            "--end",end
        ] if output_object else [
            "two_electrons_integrals",
            "--xyz",xyz,
            "--basis_set",basis_set,
            "--jobid",jobid,
            "--bucket",bucket
        ]
    response = run_ecs_task(
        commands,
        aws_resources.bucket_uri + path,
        aws_resources
        )
    click.echo("Started task. Waiting for task to finish...")
    wait_for_task(response["tasks"][0]['taskArn'],aws_resources)
    jsonFile = get_json_from_bucket(path)
    print(jsonFile)

@cli.command()
@click.option('--xyz',help="URL to xyz file",required=True)
@click.option('--basis_set',help="Basis set to be used",required=True)
@click.option('--s3_bucket',help="Path in S3 to store output of the info step",required=True)
@click.option('--num_batch_jobs',help="Number of instances to create for the batch job", default=1)
def execute_state_machine(xyz,basis_set,s3_bucket,num_batch_jobs):
    click.echo("Getting resources...")
    aws_resources = resolve_resource_config()
    click.echo("Starting state machine execution...")
    job_id = str(uuid.uuid4())
    inputDict = {
        "inputs" : {
            "commands": [
                "info",
                "--xyz",
                xyz,
                "--basis_set",
                basis_set
            ],
            "s3_bucket": s3_bucket,
            "num_batch_jobs": num_batch_jobs,
            "jobid": job_id
        }
    }
    exec_state_machine(input=inputDict,aws_resources=aws_resources,name=job_id)
    print("Job started successfully!")
    print(f"Job Id: {job_id}")

@cli.command()
@click.option('--jobid',help="Id of the job to check status of",required=True)
def get_status(jobid):
    click.echo("Getting resources...")
    aws_resources = resolve_resource_config()
    response = get_exec_status(jobid=jobid,aws_resources=aws_resources)
    status = response['status']
    print(f"Currect Execution Status: {status}")
    events = response['history']['events']

    # If Execution Succeeeded
    if status == 'SUCCEEDED':
        time = events[0]['timestamp']
        time = time.strftime("%m/%d/%Y %H:%M:%S")
        print(f"Execution completed successfully at: {time}")

    # If Execution Failed
    elif status == 'FAILED':
        print("Failed")
        # TODO

    # If Execution Running
    elif status == 'RUNNING':
        lastStateEntered = {}
        for event in events:
            if event['type'] == 'TaskStateEntered':
                lastStateEntered = event
                break
        print("Latest/Current Event:-")
        if len(lastStateEntered) == 0:
            time = events[(len(events)-1)]['timestamp']
            time = time.strftime("%m/%d/%Y %H:%M:%S")
            print(f"Execution started at: {time}")
        else:
            time = lastStateEntered['timestamp']
            time = time.strftime("%m/%d/%Y %H:%M:%S")
            print(f"{lastStateEntered['stateEnteredEventDetails']['name']} step started at: {time}")

    # If Execution Aborted
    elif status == 'ABORTED':
        time = events[0]['timestamp']
        time = time.strftime("%m/%d/%Y %H:%M:%S")
        print(f"Job was aborted at: {time}")


@cli.command()
def get_execution_list():
    click.echo("Getting resources...")
    aws_resources = resolve_resource_config()
    executions = list_execs(aws_resources=aws_resources)
    for exec in executions:
        print(f"{exec['executionArn'].split(':')[-1]} - {exec['status']}")

@cli.command()
@click.option('--jobid',help="Id of the job to abort",required=True)
def abort_execution(jobid):
    click.echo("Getting resources...")
    aws_resources = resolve_resource_config()
    abort_exec(jobid=jobid,aws_resources=aws_resources)
    print(f"Job {jobid} aborted!")




if __name__ == '__main__':
    cli()
