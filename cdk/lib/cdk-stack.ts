import { Stack, StackProps } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
//import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as batch from 'aws-cdk-lib/aws-batch';
import { Construct } from 'constructs';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';


export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    // The code that defines your stack goes here

    const repo = new ecr.Repository(this,"repository",{
      encryption: ecr.RepositoryEncryption.KMS
    });

    const bucket = new s3.Bucket(this,"testS3",{
      bucketName: "integrals-bucket"
    });

    const cluster = new ecs.Cluster(this,'integralsCluster',{
      clusterName: 'Integrals-CDK-Cluster',
    });

    cluster.addCapacity('clusterCapacity',{
      instanceType: new ec2.InstanceType('t3.micro'),
      desiredCapacity: 1,
    });

    const vpc = cluster.vpc;

    const ecsTaskRole = new iam.Role(this, 'ecsTaskRole',{
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Role for ECS Tasks',
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this,'ecsTaskPolicy','arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'),
        ManagedPolicy.fromManagedPolicyArn(this,'ecsBucketPolicy','arn:aws:iam::aws:policy/AmazonS3FullAccess')
      ]
    });

    const ecsTask = new ecs.TaskDefinition(this,'ecsTask',{
      compatibility: ecs.Compatibility.FARGATE,
      executionRole: ecsTaskRole,
      taskRole: ecsTaskRole,
      cpu: '1024',
      memoryMiB: '2048',
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      family: "IntegralsTaskDefinition"
    });


    const containerDef = ecsTask.addContainer('container',{
      image: ecs.ContainerImage.fromEcrRepository(repo,'latest'),
      containerName: 'integralsExecution',
      logging: ecs.LogDrivers.awsLogs({streamPrefix:'electron-repulsion'})
    })

    // STATE MACHINE

    /**
     * For step-functions - Create IAM Policy with GetRole and PassRole and attach to step function role
     */

    const integralsInfoStep = new tasks.EcsRunTask(this,"IntegralInfo",{
      cluster: cluster,
      launchTarget: new tasks.EcsFargateLaunchTarget(),
      taskDefinition: ecsTask,
      containerOverrides: [
        {
          containerDefinition: containerDef,
          command: sfn.JsonPath.listAt('$.inputs.commands'),
          environment: [
            {
              name: 'JSON_OUTPUT_PATH',
              value: sfn.JsonPath.stringAt('$.inputs.s3_bucket')
            },
            {
              name: 'BATCH_EXECUTION',
              value: sfn.JsonPath.stringAt('$.inputs.batch_execution')
            }
          ]
        }
      ],
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      assignPublicIp: true
    });

    const readInfoS3Role = new iam.Role(this,'readInfoS3Role',{
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role for readInfoS3',
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this,'ecsBucketPolicy','arn:aws:iam::aws:policy/AmazonS3FullAccess')
      ],
      roleName: "reafInfoS3Role"
    });

    const basicLambdaExecution = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],
      resources: [`arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*`]
    });

    readInfoS3Role.addToPolicy(basicLambdaExecution);

    const readInfoS3Lambda = new lambda.Function(this,'ReadInfoS3Function',{
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset('./lambda/readInfoS3/'),
      role: readInfoS3Role,
      functionName: "readInfoS3CDK",
      timeout: cdk.Duration.seconds(20),
      memorySize: 256
    });

    const readInfoS3Step = new tasks.LambdaInvoke(this,"readInfoS3Step",{
      lambdaFunction: readInfoS3Lambda,
      integrationPattern: sfn.IntegrationPattern.RUN_JOB
    });

    // Sequential way to run two_electrons_integrals step

    const integralsTwoElectronsIntegralsSeqStep = new tasks.EcsRunTask(this,"IntegralsTEI",{
      cluster: cluster,
      launchTarget: new tasks.EcsFargateLaunchTarget(),
      taskDefinition: ecsTask,
      containerOverrides: [
        {
          containerDefinition: containerDef,
          command: sfn.JsonPath.listAt('$.inputs.commands'),
          environment: [
            {
              name: 'JSON_OUTPUT_PATH',
              value: sfn.JsonPath.stringAt('$.inputs.s3_bucket')
            }
          ]
        }
      ],
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      assignPublicIp: true
    });

    // AWS Batch way of running two_electrons_integrals step (including Batch setup)

    const batchComputeEnv = new batch.CfnComputeEnvironment(this,"computeEnv",{
      computeEnvironmentName: "batch-compute-environment",
      type: 'MANAGED',
      computeResources: {
        type: 'SPOT',
        maxvCpus: 256,
        minvCpus: 0,
        instanceRole: ecsTaskRole.roleArn,
        instanceTypes: ['optimal'],
        subnets: [vpc.publicSubnets[0].subnetId,vpc.publicSubnets[1].subnetId],
      }
    });

    const batchJobQueue = new batch.CfnJobQueue(this,"jobQueue",{
      priority: 10,
      jobQueueName: "batchJobQueue",
      computeEnvironmentOrder: [{
        computeEnvironment: batchComputeEnv.attrComputeEnvironmentArn,
        order: 1
      }]
    });

    const batchJobDefinition = new batch.CfnJobDefinition(this,"jobDef",{
      type: 'container',
      containerProperties: {
        image: ecs.ContainerImage.fromEcrRepository(repo,'latest').imageName,
        executionRoleArn: ecsTaskRole.roleArn
      },
      jobDefinitionName: "batch_job_definition",
      platformCapabilities: ['EC2'],
      retryStrategy: {
        attempts: 2
      }
    });

    const batchSubmitJobTask = new tasks.BatchSubmitJob(this,"batchSubmitJobTask",{
      jobDefinitionArn: `arn:aws:batch:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:job-definition/${batchJobDefinition.jobDefinitionName}:1`,
      jobName: 'tei_batch_job_submission',
      jobQueueArn: batchJobQueue.attrJobQueueArn,
      containerOverrides: {
        command: sfn.JsonPath.listAt("$.inputs.commands"),
        environment: {
          "JSON_OUTPUT_PATH": sfn.JsonPath.stringAt("$.inputs.s3_bucket"),
          "ARGS_PATH": sfn.JsonPath.stringAt("$.inputs.args_path")
        }
      },
      arraySize: sfn.JsonPath.numberAt("$.inputs.numSlices"),
      integrationPattern: sfn.IntegrationPattern.RUN_JOB
    });

    const stepFuncDefinition = integralsInfoStep
                               .next(readInfoS3Step)
                               .next(new sfn.Choice(this,"batchExec")
                                  // Batch Execution False
                                  .when(sfn.Condition.stringEquals("$.inputs.batch_execution","true"),
                                    batchSubmitJobTask
                                  )
                                  // Batch Execution True
                                  .otherwise(integralsTwoElectronsIntegralsSeqStep)
                               );

    /*

    Use if using DynamoDB.

    const database = new dynamodb.Table(this,'testTable',{
      partitionKey: {name: 'id', type: dynamodb.AttributeType.STRING},
      sortKey: {name:'email', type: dynamodb.AttributeType.STRING},
      stream: StreamViewType.NEW_AND_OLD_IMAGES
    });

    const dynamoReadRole = new iam.Role(this, 'dynamoReadRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role to enable Lambda functions to read from Dynamo streams',
      managedPolicies: [ManagedPolicy.fromManagedPolicyArn(this,'readDynamo','arn:aws:iam::aws:policy/service-role/AWSLambdaDynamoDBExecutionRole')]
    });

    const dynamoWritePolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        actions: [
          "dynamodb:CreateTable",
          "dynamodb:BatchWriteItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteTable",
          "dynamodb:UpdateTable",
        ],
        effect: iam.Effect.ALLOW,
        resources: ['*']
      })]
    });

    const dynamoWriteRole = new iam.Role(this,'dynamoWriteRole',{
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role to write to dynamoDB',
      managedPolicies: [ManagedPolicy.fromManagedPolicyArn(this,'lambdaExecutionRole','arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole')],
      inlinePolicies: {'writeDynamo': dynamoWritePolicy}
    });

    */

  }
}
