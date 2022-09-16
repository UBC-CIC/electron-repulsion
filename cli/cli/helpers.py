import boto3
import json
from dataclasses import dataclass
from typing import List

ecs = boto3.client('ecs')
s3 = boto3.client('s3')
sts = boto3.client('sts')
ec2 = boto3.client('ec2')
sfn = boto3.client('stepfunctions')

# Class to keep track of AWS resources
@dataclass
class ResourceConfig:
    subnets: List[str]
    cluster_arn: str
    task_arn: str
    bucket_uri: str
    sfn_arn: str
    exec_arn: str


def resolve_resource_config() -> ResourceConfig:
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
    return ResourceConfig(
        [subnets['Subnets'][0]['SubnetId'],subnets['Subnets'][1]['SubnetId']],
        f"arn:aws:ecs:{region}:{account_id}:cluster/Integrals-CDK-Cluster",
        f"arn:aws:ecs:{region}:{account_id}:task-definition/IntegralsTaskDefinition",
        's3://integrals-bucket/',
        f"arn:aws:states:{region}:{account_id}:stateMachine:IntegralsStateMachine",
        f"arn:aws:states:{region}:{account_id}:execution:IntegralsStateMachine"
    )

# Runs the ECS task with the given commands and S3 destination
# Accepts command as an array of strings and s3_path as a string
def run_ecs_task(command,s3_path,aws_resources):
    response = ecs.run_task(
        count=1,
        cluster=aws_resources.cluster_arn,
        enableECSManagedTags=False,
        enableExecuteCommand=False,
        launchType='FARGATE',
        networkConfiguration={
            'awsvpcConfiguration':{
                'subnets': aws_resources.subnets,
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
                        },
                        {
                            'name':'BATCH_EXECUTE',
                            'value':'true'
                        },
                        {
                            'name': 'AWS_BATCH_ARRAY_INDEX',
                            'value': '1'
                        }
                    ]
                }
            ]
        },
        startedBy='CLI',
        taskDefinition=aws_resources.task_arn
    )
    return response

# Blocks execution till the task with the given arn is finsihed
def wait_for_task(arn,aws_resources):
    waiter = ecs.get_waiter('tasks_stopped')
    waiter.wait(cluster=aws_resources.cluster_arn, tasks=[arn])

# State machine execution

def exec_state_machine(input,aws_resources,name):
    response = sfn.start_execution(
        input=json.dumps(input),
        stateMachineArn=aws_resources.sfn_arn,
        name=name
    )
    return response

# Get State Machine Execution Status

def get_exec_status(jobid,aws_resources):
    execution_arn = f"{aws_resources.exec_arn}:{jobid}"
    status = sfn.describe_execution(executionArn=execution_arn)['status']
    exec_history = sfn.get_execution_history(
        executionArn=execution_arn,
        reverseOrder=True,
        includeExecutionData=True
        )
    return {
        'status': status,
        'history': exec_history
    }

# Abort state machine execution
def abort_exec(jobid,aws_resources):
    execution_arn = f"{aws_resources.exec_arn}:{jobid}"
    sfn.stop_execution(executionArn=execution_arn)

# Gets JSON from bucket at the location specified by key
def get_json_from_bucket(key):
    obj = s3.get_object(
        Bucket='integrals-bucket',
        Key=key
    )
    return json.loads(obj['Body'].read())
