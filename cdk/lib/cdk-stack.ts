import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
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
import * as logs from 'aws-cdk-lib/aws-logs';


export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    // The code that defines your stack goes here

    const repo = new ecr.Repository(this,"repository",{
      encryption: ecr.RepositoryEncryption.KMS,
      repositoryName: 'integrals-repo',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const bucketName = new cdk.CfnParameter(this, "bucketName", {
      type: "String",
      description: "The name of the Amazon S3 bucket where all outputs will be stored. Value must be globally unique"}
    );

    const bucket = new s3.Bucket(this,"S3Bucket",{
      bucketName: bucketName.valueAsString,
      // TO REMOVE LATER
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const cluster = new ecs.Cluster(this,'integralsCluster',{
      clusterName: 'Integrals-CDK-Cluster',
    });

    cluster.addCapacity('clusterCapacity',{
      instanceType: new ec2.InstanceType('t3.micro'),
      desiredCapacity: 1,
    });

    const vpc = cluster.vpc;

    const securityGroup = new ec2.SecurityGroup(this,'securityGroup',{
      allowAllOutbound: true,
      vpc: vpc,
      securityGroupName: 'cdkVpcSecurityGroup'
    });

    const ecsTaskRole = new iam.Role(this, 'ecsTaskRole',{
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Role for ECS Tasks',
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this,'ecsTaskPolicy','arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'),
        ManagedPolicy.fromManagedPolicyArn(this,'ecsBucketPolicy','arn:aws:iam::aws:policy/AmazonS3FullAccess'),
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
      assignPublicIp: true,
      resultPath: "$.output"
    });

    const readInfoS3Role = new iam.Role(this,'readInfoS3Role',{
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role for readInfoS3',
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this,'ecsBucketPolicy2','arn:aws:iam::aws:policy/AmazonS3FullAccess')
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
      memorySize: 256,
      environment: {
        "s3_bucket": bucketName.valueAsString
      }
    });

    const readInfoS3Step = new tasks.LambdaInvoke(this,"readInfoS3Step",{
      lambdaFunction: readInfoS3Lambda,
      outputPath: "$.Payload"
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

    const spotFleetRole = new iam.Role(this, 'spotFleetRole', {
      roleName: 'AmazonEC2SpotFleetRole',
      assumedBy: new iam.ServicePrincipal('spotfleet.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this,'sptFleetRole','arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole')
      ]
    });

    const batchInstanceRole = new iam.Role(this,"batchInstanceRole",{
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'Role for Batch Instances',
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this,'ecsTaskPolicy2','arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role'),
        ManagedPolicy.fromManagedPolicyArn(this,'ecsBucketPolicy3','arn:aws:iam::aws:policy/AmazonS3FullAccess'),
      ]
    })

    const EcsInstanceProfile = new iam.CfnInstanceProfile(this, 'ECSInstanceProfile', {
      instanceProfileName: batchInstanceRole.roleName,
      roles: [
        batchInstanceRole.roleName
      ]
    });

    const batchServiceRole = new iam.Role(this, 'batchServiceRole', {
      roleName: 'batchServiceRole',
      assumedBy: new iam.ServicePrincipal('batch.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this,'BatchServiceRole','arn:aws:iam::aws:policy/service-role/AWSBatchServiceRole')
      ]
    });

    const batchComputeEnv = new batch.CfnComputeEnvironment(this,"computeEnv",{
      computeEnvironmentName: "batch-compute-environment",
      type: 'MANAGED',
      serviceRole: batchServiceRole.roleArn,
      computeResources: {
        type: 'SPOT',
        spotIamFleetRole: spotFleetRole.roleArn,
        maxvCpus: 256,
        minvCpus: 0,
        instanceRole: EcsInstanceProfile.attrArn,
        instanceTypes: ['optimal'],
        subnets: [vpc.publicSubnets[0].subnetId,vpc.publicSubnets[1].subnetId],
        securityGroupIds: [
          securityGroup.securityGroupId
        ]
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
        executionRoleArn: ecsTaskRole.roleArn,
        vcpus: 1,
        memory: 512
      },
      jobDefinitionName: "batch_job_definition",
      platformCapabilities: ['EC2'],
      retryStrategy: {
        attempts: 2
      }
    });

    const batchSubmitJobTask = new tasks.BatchSubmitJob(this,"batchSubmitJobTask",{
      jobDefinitionArn: `arn:aws:batch:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:job-definition/${batchJobDefinition.jobDefinitionName}`,
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

    const logGroup = new logs.LogGroup(this,'LogGroup');

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


    // State Machine Role

    const stateMachineRole = new iam.Role(this,'SMRole',{
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      roleName: 'stateMachineRole'
    });

    // Attaching policies to the role

    stateMachineRole.attachInlinePolicy(new iam.Policy(this,'cloudWatchPolicy',{
      statements: [
        new iam.PolicyStatement({
          actions: [
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies",
          "logs:DescribeLogGroups"],
          resources: ['*'],
          effect: iam.Effect.ALLOW
        })
      ]
    }));

    stateMachineRole.attachInlinePolicy(new iam.Policy(this,'EcsTaskPolicySM',{
      statements: [
        new iam.PolicyStatement({
          actions: [
            "ecs:runTask"
          ],
          resources: [ecsTask.taskDefinitionArn],
          effect: iam.Effect.ALLOW
        })
      ]
    }));

    stateMachineRole.attachInlinePolicy(new iam.Policy(this,'InvokeLambdaPolicy',{
      statements: [
        new iam.PolicyStatement({
          actions: [
            "lambda:InvokeFunction"
          ],
          resources: ['*'],
          effect: iam.Effect.ALLOW
        })
      ]
    }));

    stateMachineRole.attachInlinePolicy(new iam.Policy(this,'batchPolicy',{
      statements: [
        new iam.PolicyStatement({
          actions: [
            "batch:*",
            "events:*"
          ],
          resources: ['*'],
          effect: iam.Effect.ALLOW
        })
      ]
    }));

    stateMachineRole.attachInlinePolicy(new iam.Policy(this,'sfnIamPolicy',{
      statements: [
        new iam.PolicyStatement({
          actions: [
            "iam:GetRole",
            "iam:PassRole"
          ],
          resources: ['*'],
          effect: iam.Effect.ALLOW
        })
      ]
    }));

    stateMachineRole.attachInlinePolicy(new iam.Policy(this,'XrayPolicy',{
      statements: [
        new iam.PolicyStatement({
          actions: [
            "xray:PutTraceSegments",
            "xray:PutTelemetryRecords",
            "xray:GetSamplingRules",
            "xray:GetSamplingTargets"
          ],
          resources: ['*'],
          effect: iam.Effect.ALLOW
        })
      ]
    }));

    const stepFunction = new sfn.StateMachine(this,'StateMachine',{
      definition: stepFuncDefinition,
      stateMachineName: "IntegralsStateMachine",
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL
      },
      role: stateMachineRole
    });

    // Output the ECR Repository URI

    new CfnOutput(this,"ecrRepoUri",{
      value: repo.repositoryUri,
      description: "ECR Repository for this stack, push Docker image here."
    });

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
