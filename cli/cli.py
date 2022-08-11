#!/usr/bin/env python3

import click
import boto3
import uuid

ecs = boto3.client('ecs')
sts = boto3.client('sts')
ec2 = boto3.client('ec2')

# Setting up ARNs and Ids of different resources used
region = boto3.Session().region_name
account_id = sts.get_caller_identity()['Account']

# Get VPC id by VPC name
vpcs = ec2.describe_vpcs(Filters=[
    {
        'Name': 'tag:Name',
        'Values': ['CdkStack/integralsCluster/Vpc']
    }
])
vpcId = vpcs['Vpcs'][0]['VpcId']

# Get Subnets from VPC Id
subnets = ec2.describe_subnets(Filters=[
    {
        'Name': 'vpc-id',
        'Values': [vpcId]
    }
])

SUBNETS = [subnets['Subnets'][0]['SubnetId'],subnets['Subnets'][1]['SubnetId']]
BUCKET_URI = 's3://integrals-bucket/'
CLUSTER_ARN = f"arn:aws:ecs:{region}:{account_id}:cluster/Integrals-CDK-Cluster"
TASK_ARN = f"arn:aws:ecs:{region}:{account_id}:task-definition/IntegralsTaskDefinition"

# Runs the ECS task with the given commands and S3 destination
# Accepts command as an array of strings and s3_path as a string
def run_ecs_task(command,s3_path):
    response = ecs.run_task(
        count=1,
        cluster=CLUSTER_ARN,
        enableECSManagedTags=False,
        enableExecuteCommand=False,
        launchType='FARGATE',
        networkConfiguration={
            'awsvpcConfiguration':{
                'subnets': SUBNETS,
                'assignPublicIp': 'ENABLED'
            }
        },
        overrides={
            'containerOverrides':[
                {
                    'name': 'integralsExecution',
                    'command': command,
                    'environment':[
                        {
                            'name':'JSON_OUTPUT_PATH',
                            'value':s3_path
                        }
                    ] 
                }
            ]
        },
        startedBy='CLI',
        taskDefinition=TASK_ARN
    )
    return response

@click.group()
def cli():
    pass

@cli.command()
@click.option('--xyz',help="URL to xyz file")
@click.option('--basis_set',help="Basis set to be used")
def info(xyz,basis_set):
    if(xyz and basis_set):
        click.echo("Starting task info...")
        response = run_ecs_task(
            ["info","--xyz",xyz,"--basis_set",basis_set],
            BUCKET_URI + 'info/' + str(uuid.uuid4()) + '-info.json'
            )
        click.echo(response)
    else:
        click.echo("Insufficient arguments!")    
    

if __name__ == '__main__':
    cli()
