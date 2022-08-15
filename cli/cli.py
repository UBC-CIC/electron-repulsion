#!/usr/bin/env python3


from importlib import resources
import click
import uuid
from helpers import *

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
@click.option('--output_object',help="Object name to write output to",required=True)
@click.option('--begin',help="Index to begin calculation at",required=True)
@click.option('--end',help="Index to end calculation at",required=True)
def two_electrons_integrals(xyz,basis_set,jobid,bucket,output_object,begin,end):
    click.echo("Getting resources...")
    aws_resources = resolve_resource_config()
    click.echo("Starting task two_electrons_integrals...")
    path = 'two_electrons_integrals/' + jobid + '-tei.json'
    response = run_ecs_task(
        [
            "two_electrons_integrals",
            "--xyz",xyz,
            "--basis_set",basis_set,
            "--jobid",jobid,
            "--bucket",bucket,
            "--output_object",output_object,
            "--begin",begin,
            "--end",end
        ],
        aws_resources.bucket_uri + path,
        aws_resources
        )
    click.echo("Started task. Waiting for task to finish...")
    wait_for_task(response["tasks"][0]['taskArn'],aws_resources)
    jsonFile = get_json_from_bucket(path)
    print(jsonFile)     
    

if __name__ == '__main__':
    cli()
