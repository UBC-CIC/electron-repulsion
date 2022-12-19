import boto3
import os
ec2 = boto3.client('ec2')
subnet_id = os.environ['SUBNET_ID']
cluster_name = os.environ['CLUSTER_NAME']
image_id = os.environ['IMAGE_ID']
security_group_id = os.environ['SECURITY_GROUP_ID']

def lambda_handler(event, context):
    response = ec2.run_instances(
        MaxCount=1,
        MinCount=1,
        InstanceType="t3.medium",
        SubnetId=subnet_id,
        ImageId=image_id,
        IamInstanceProfile={
            "Arn": "arn:aws:iam::808031297437:instance-profile/ecsInstanceRole"
        },
        SecurityGroupIds=[
            security_group_id
        ],
        UserData=f"#!/bin/bash\necho ECS_CLUSTER={cluster_name} >> /etc/ecs/ecs.config"
        )
    instance_id = response['Instances'][0]['InstanceId']
    return {
        'commands': event['commands'],
        's3_bucket_path': event['s3_bucket_path'],
        'num_batch_jobs': event['num_batch_jobs'],
        'jobid': event['jobid'],
        'batch_execution': event['batch_execution'],
        'max_iter': event['max_iter'],
        'epsilon': event['epsilon'],
        'instance_id': instance_id,
        'instance_filter': f"ec2InstanceId=={instance_id}"
    }
