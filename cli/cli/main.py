import click
import uuid
import cli.helpers as helpers


@click.group()
def cli():
    pass


@cli.command()
@click.option('--xyz', help="URL to xyz file", required=True)
@click.option('--basis_set', help="Basis set to be used", required=True)
@click.option('--bucket', help="Bucket for job metadata", required=True)
@click.option('--num_parts', help="Number of parts to divide the two_electrons_integrals step into", default=None)
@click.option('--max_iter', help="Maximum number of iterations in the fock-scf loop", default=30)
@click.option(
    '--batch_execution', help="Enter true to execute of AWS Batch else false (defaults to false)", default="false")
@click.option(
    '--epsilon', help="The difference between the previous and current hartree_fock_energy to mark the end of the loop",
    default=0.000000001)
def execute_state_machine(xyz, basis_set, bucket, num_parts, max_iter, batch_execution, epsilon):
    click.echo("Getting resources...")
    aws_resources = helpers.resolve_resource_config(bucket)
    click.echo("Starting state machine execution...")
    job_id = str(uuid.uuid4())
    inputDict = {
        "commands": ["info", "--xyz", xyz, "--basis_set", basis_set],
        "s3_bucket_path": f's3://{bucket}/job_files/{job_id}/json_files/{job_id}_info.json',
        "num_batch_jobs": num_parts,
        "jobid": job_id,
        "batch_execution": batch_execution,
        "max_iter": max_iter,
        "epsilon": epsilon
    }
    helpers.exec_state_machine(input=inputDict, aws_resources=aws_resources, name=job_id)
    print("Job started successfully!")
    print(f"Job Id: {job_id}")


@cli.command()
@click.option('--jobid', help="Id of the job to check status of", required=True)
@click.option('--bucket', help="Bucket for job metadata", required=True)
def get_status(jobid, bucket):
    click.echo("Getting resources...")
    aws_resources = helpers.resolve_resource_config(bucket)
    response = helpers.get_exec_status(jobid=jobid, aws_resources=aws_resources)
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
        time = events[0]['timestamp']
        time = time.strftime("%m/%d/%Y %H:%M:%S")
        print(f"Execution failed at: {time}")
        print(f"Cause: {events[0]['executionFailedEventDetails']['cause']}")

    # If Execution Running
    elif status == 'RUNNING':
        lastStateEntered = {}
        for event in events:
            if event['type'] == 'TaskStateEntered':
                lastStateEntered = event
                break
        print("Latest/Current Event:-")
        if len(lastStateEntered) == 0:
            time = events[len(events) - 1]['timestamp']
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
@click.option('--bucket', help="Bucket for job metadata", required=True)
def get_execution_list(bucket):
    click.echo("Getting resources...")
    aws_resources = helpers.resolve_resource_config(bucket)
    executions = helpers.list_execs(aws_resources=aws_resources)
    for exec in executions:
        print(f"{exec['executionArn'].split(':')[-1]} - {exec['status']}")


@cli.command()
@click.option('--jobid', help="Id of the job to abort", required=True)
@click.option('--bucket', help="Bucket for job metadata", required=True)
def abort_execution(jobid, bucket):
    click.echo("Getting resources...")
    aws_resources = helpers.resolve_resource_config(bucket)
    helpers.abort_exec(jobid=jobid, aws_resources=aws_resources)
    print(f"Job {jobid} aborted!")


@cli.command()
@click.option('--jobid', help="Id of the job files to delete", required=True)
@click.option('--bucket', help="Bucket for job metadata", required=True)
def delete_job_files(jobid, bucket):
    helpers.delete_files_from_bucket(bucket_name=bucket, jobid=jobid)
    print("Done!")


@cli.command()
@click.option('--jobid', help="Id of the job files to download", required=True)
@click.option('--bucket', help="Bucket for job metadata", required=True)
@click.option('--target', help="Target directory", required=True)
def download_job_files(jobid, bucket, target):
    helpers.download_files_from_bucket(bucket_name=bucket, jobid=jobid, target=target)
    print("Done!")


if __name__ == '__main__':
    cli()
