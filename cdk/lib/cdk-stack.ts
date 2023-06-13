import { CfnOutput, Stack, StackProps, Duration } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { ManagedPolicy } from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { BaseVpc } from "./base-vpc";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";

export class IntegralsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    /**
     *  Helper Functions
     */

    /**
     * CDK Helper Function - Returns a Lambda function for use in the step functions
     * id: CDK Id of the resource
     * codePath: Path to the lambda_function code
     * name: Name of the Lambda function
     */
    const cdkLambdaFunction = (id: string, codePath: string, name: string): lambda.Function => {
      const func = new lambda.Function(this, id, {
        runtime: lambda.Runtime.PYTHON_3_9,
        handler: "lambda_function.lambda_handler",
        code: lambda.Code.fromAsset(codePath),
        role: setupLambdaRole,
        functionName: name,
        timeout: cdk.Duration.seconds(20),
        memorySize: 256,
        environment: {
          ER_S3_BUCKET: bucketName.valueAsString,
          TASK_QUEUE: taskQueue.queueUrl,
          BATCH_TABLE: batchTable.tableName,
          DELETED_JOB_TABLE: deletedJobTable.tableName,
        }
      });
      taskQueue.grantSendMessages(func);
      batchTable.grantWriteData(func);
      deletedJobTable.grantWriteData(func);
      func.addPermission(`${name}permission`, {
        principal: new iam.ServicePrincipal("states.amazonaws.com"),
        action: "lambda:InvokeFunction",
        sourceArn: `arn:aws:states:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:stateMachine:IntegralsStateMachine`,
        sourceAccount: cdk.Stack.of(this).account
      });
      return func;
    };

    /**
     * CDK Helper Function - Returns a LambdaInvoke step for use in the step function
     * id: CDK Id of the resource
     * lambdaFunction: lambda.Function type entity to be invoked as part of this step
     */
    const cdkLambdaInvokeSfn = (id: string, lambdaFunction: lambda.Function): tasks.LambdaInvoke => {
      return new tasks.LambdaInvoke(this, id, {
        lambdaFunction: lambdaFunction,
        outputPath: "$.Payload",
      });
    };

    /**
     * CDK Helper Function - Returns a Pass step for use in the step function. This step makes adds an output
     * object to the input as follows:
     * "output": {
     *  "stepName": stepName
     * }
     * id: CDK Id of the resource
     * stepName: The string that stores the stepName to be used in the output object
     */
    const cdkModifyInputs = (id: string, stepName: string): sfn.Pass => {
      return new sfn.Pass(this, id, {
        resultPath: "$.output",
        result: sfn.Result.fromObject({ stepName: stepName }),
      });
    };

    /**
     * Stack code
     */

    // The ECR Repository that stores the Docker image
    const repo = new ecr.Repository(this, "repository", {
      encryption: ecr.RepositoryEncryption.KMS,
      repositoryName: "integrals-repo",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Parameter taken as input during cdk deploy, the name used for the bucket
    const bucketName = new cdk.CfnParameter(this, "bucketName", {
      type: "String",
      description: "The name of the Amazon S3 bucket where all outputs will be stored. Value must be globally unique",
    });

    // The S3 used for this project
    const bucket = new s3.Bucket(this, "S3Bucket", {
      bucketName: bucketName.valueAsString,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
    });

    // The queue used for the integrals tasks
    const taskQueue = new sqs.Queue(this, 'TaskQueue', {
      visibilityTimeout: Duration.hours(2),
    });

    const batchTable = new dynamodb.Table(this, 'BatchTable', {
      partitionKey: { name: 'jobid', type: dynamodb.AttributeType.STRING },
      tableName: 'IntegralsBatchTable',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const deletedJobTable = new dynamodb.Table(this, 'deletedJobTable', {
      partitionKey: { name: 'jobid', type: dynamodb.AttributeType.STRING },
      tableName: 'IntegralsDeletedJobTable',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const vpc = new BaseVpc(this, "vpc", {
      vpcName: "IntegralsVpc",
      maxAzs: 1,
      subnetConfiguration: [
        {
          name: "publicSubnet",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24
        },
        {
          name: "privateSubnet",
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
          cidrMask: 24
        }
      ]
    })

    const vpcEndpoint = new ec2.GatewayVpcEndpoint(this, "vpcEndpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      vpc: vpc,
    });

    // The ECS Cluster used to run ECS Fargate instances
    const cluster = new ecs.Cluster(this, "integralsCluster", {
      clusterName: "Integrals-CDK-Cluster",
      vpc: vpc,
      enableFargateCapacityProviders: true,
    });

    // Simple security group that allows all outbound traffic
    const securityGroup = new ec2.SecurityGroup(this, "securityGroup", {
      allowAllOutbound: true,
      vpc: vpc,
      securityGroupName: "cdkVpcSecurityGroup",
    });

    // Role for ECS Task (has the AmazonECSTaskExecutionRolePolicy and AmazonS3FullAccess policies)
    const ecsTaskRole = new iam.Role(this, "ecsTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Role for ECS Tasks",
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(
          this,
          "ecsTaskPolicy",
          "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
        ),
        ManagedPolicy.fromManagedPolicyArn(this, "ecsBucketPolicy", "arn:aws:iam::aws:policy/AmazonS3FullAccess"),
        ManagedPolicy.fromManagedPolicyArn(this, "ecsSFNPolicy", "arn:aws:iam::aws:policy/AWSStepFunctionsFullAccess"),
        ManagedPolicy.fromManagedPolicyArn(this, "ecsSQSPolicy", "arn:aws:iam::aws:policy/AmazonSQSFullAccess"),
        ManagedPolicy.fromManagedPolicyArn(this, "ecsDynamoDBPolicy", "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"),
      ],
      inlinePolicies: {
        ecsPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["ecs:UpdateTaskProtection"],
              resources: ["*"],
              effect: iam.Effect.ALLOW,
            }),
          ],
        }),
      },
    });

    // Task definition for all ECS tasks. Change the cpu and memoryMiB to change the resource availability of each Fargate task
    const ecsTask = new ecs.TaskDefinition(this, "ecsTask", {
      compatibility: ecs.Compatibility.FARGATE,
      executionRole: ecsTaskRole,
      taskRole: ecsTaskRole,
      cpu: "2048",
      memoryMiB: "16384",
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      family: "IntegralsTaskDefinition",
    });

    const ecsService = new ecs.FargateService(this, "ecsService", {
      cluster: cluster,
      serviceName: "Integrals-Service",
      taskDefinition: ecsTask,
      desiredCount: 0,
      capacityProviderStrategies: [
        {
          capacityProvider: "FARGATE_SPOT",
          weight: 5,
        },
        {
          capacityProvider: "FARGATE",
          weight: 1,
          base: 1,
        }
      ],
    });

    // Auto scaling policy for the ECS service
    const scaling = ecsService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 20,
    });

    // Scaling policy to scale up when Queue length is greater than 10
    scaling.scaleOnMetric("QueueLengthScaling", {
      metric: taskQueue.metricApproximateNumberOfMessagesVisible(),
      adjustmentType: autoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
      scalingSteps: [
        { upper: 10, change: -1 },
        { lower: 30, change: +1 },
        { lower: 100, change: +5 },
      ],
    });


    // Container definition for each task, uses the latest image in the ECR repository
    const containerDef = ecsTask.addContainer("container", {
      image: ecs.ContainerImage.fromEcrRepository(repo, "latest"),
      containerName: "integralsExecution",
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "electron-repulsion" }),
      environment: {
        "TASK_QUEUE": taskQueue.queueUrl,
        "BATCH_TABLE": batchTable.tableName,
        "DELETED_JOB_TABLE": deletedJobTable.tableName,
      }
    });


    const integralsInfoStep = this.submitEcsTask("integralsInfoStep", taskQueue);

    // Role for Lambda functions (includes S3 access)
    const setupLambdaRole = new iam.Role(this, "setupLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "Role for readInfoS3",
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this, "ecsBucketPolicy2", "arn:aws:iam::aws:policy/AmazonS3FullAccess"),
      ],
      roleName: "setupLambdaRole",
    });

    // BasicLambdaExecution policy to add to the setupLambdaRole
    const basicLambdaExecution = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      resources: [`arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*`],
    });

    setupLambdaRole.addToPolicy(basicLambdaExecution);

    // Lambda function to setup the two_electrons_integrals step
    const setupTeiLambda = cdkLambdaFunction("setupTEILambda", "./lambda/setupTei/", "setupTei");

    // One Lambda function that sets up all other calculations
    const setupCalculationsLambda = cdkLambdaFunction(
      "setupCalculationsLambda",
      "./lambda/setupCalculations/",
      "setupCalculations"
    );

    // Lambda function to update the variables that determine whether the Fock-SCF loop must continue
    const updateLoopVariablesLambda = cdkLambdaFunction(
      "updateLoopVariablesLambda",
      "./lambda/updateLoopVariables/",
      "updateLoopVariables"
    );

    // Lambda function to put a job in the deleted jobs table
    const deleteJobLambda = cdkLambdaFunction(
      "deleteJobLambda",
      "./lambda/deleteJob/",
      "deleteJob"
    );

    // Creating LambdaInvoke steps for all Lambda functions
    const setupTeiStep = new tasks.LambdaInvoke(this, "setupTeiStep", {
      lambdaFunction: setupTeiLambda,
      outputPath: "$",
      payload: sfn.TaskInput.fromObject({
        "payload.$": "$",
        "task_token": sfn.JsonPath.taskToken,
      }),
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
    })

    const setupCoreHamiltonianStep = cdkLambdaInvokeSfn("setupCoreHamiltonianStep", setupCalculationsLambda);
    const setupOverlapMatrixStep = cdkLambdaInvokeSfn("setupOverlapMatrixStep", setupCalculationsLambda);
    const setupInitialGuessStep = cdkLambdaInvokeSfn("setupInitialGuessStep", setupCalculationsLambda);
    const setupFockMatrixStep = cdkLambdaInvokeSfn("setupFockMatrixStep", setupCalculationsLambda);
    const setupScfStep = cdkLambdaInvokeSfn("setupScfStep", setupCalculationsLambda);
    const updateLoopVariables = cdkLambdaInvokeSfn("updateLoopVariables", updateLoopVariablesLambda);

    // Creating Pass steps that add a stepName to the input. This stepName is the the name of the step for which the next calculation should be setup
    // by the setupCalculationsLambda
    const modifyInputsCoreHamiltonian = cdkModifyInputs("modifyInputsCoreHamiltonian", "core_hamiltonian");
    const modifyInputsOverlap = cdkModifyInputs("modifyInputsOverlap", "overlap");
    const modifyInputsInitialGuess = cdkModifyInputs("modifyInputsInitialGuess", "initial_guess");
    const modifyInputsFockMatrix = cdkModifyInputs("modifyInputsFockMatrix", "fock_matrix");
    const modifyInputsScf = cdkModifyInputs("modifyInputsScf", "scf_step");

    // A Pass step to give initial values to loop variables, variable stored in loopData
    const initializeLoopVariables = new sfn.Pass(this, "initializeLoopVariables", {
      result: sfn.Result.fromObject({
        loopCount: 1,
        hartree_diff: Number.MAX_VALUE,
      }),
      resultPath: "$.loopData",
    });

    // Core Hamiltonian parallel step
    const coreHamiltonianStep = this.submitEcsTask("coreHamiltonianStep", taskQueue);

    // Overlap Matrix parallel step
    const overlapMatrixStep = this.submitEcsTask("overlapMatrixStep", taskQueue);

    // Initial Guess parallel step
    const initialGuessStep = this.submitEcsTask("initialGuessStep", taskQueue);

    // Sequential way to run two_electrons_integrals step
    const integralsTwoElectronsIntegralsSeqStep = this.submitEcsTask("IntegralsTEI", taskQueue);

    // Fock Matrix step
    const fockMatrixStep = this.submitEcsTask("fockMatrixStep", taskQueue);

    // Scf Step
    const scfStep = this.submitEcsTask("scfStep", taskQueue);


    const logGroup = new logs.LogGroup(this, "LogGroup");


    // Condition to determine whether the Fock-SCF loop will continue
    const loopCondition = sfn.Condition.and(
      sfn.Condition.numberLessThanEqualsJsonPath("$.loopData.loopCount", "$.max_iter"),
      sfn.Condition.numberGreaterThanJsonPath("$.loopData.hartree_diff", "$.epsilon")
    );

    // Fock-SCF loop
    const fockScfLoop = new sfn.Choice(this, "Loop");

    // Contains Fock step, then SCF step, then update loop variables
    const loopBody = modifyInputsFockMatrix
      .next(setupFockMatrixStep)
      .next(fockMatrixStep)
      .next(modifyInputsScf)
      .next(setupScfStep)
      .next(scfStep)
      .next(updateLoopVariables)
      .next(fockScfLoop);

    // Check condition
    fockScfLoop.when(loopCondition, loopBody).otherwise(new sfn.Succeed(this, "Success"));

    const stepFuncDefinition = integralsInfoStep
      .next(
        // take outputs from the first parallel step and pass to next
        new sfn.Parallel(this, "parallelExec", {
          resultSelector: {
            "commands.$": "$[0].commands",
            "s3_bucket_path.$": "$[0].s3_bucket_path",
            "jobid.$": "$[0].jobid",
            "max_iter.$": "$[0].max_iter",
            "epsilon.$": "$[0].epsilon",
          },
        })
          // Core_hamiltonian, Overlap, Initial_guess and two_electrons_integrals can be run in parallel
          .branch(
            modifyInputsCoreHamiltonian
              .next(setupCoreHamiltonianStep)
              .next(coreHamiltonianStep))
          .branch(
            modifyInputsOverlap
              .next(setupOverlapMatrixStep)
              .next(overlapMatrixStep))
          .branch(
            modifyInputsInitialGuess
              .next(setupInitialGuessStep)
              .next(initialGuessStep))
          .branch(setupTeiStep)
      )
      .next(initializeLoopVariables)
      .next(fockScfLoop);

    // State Machine Role
    const stateMachineRole = new iam.Role(this, "SMRole", {
      assumedBy: new iam.ServicePrincipal("states.amazonaws.com"),
      roleName: "stateMachineRole",
    });

    // Attaching policies to the role (all needed policies for the state machine depending upon the services it uses)
    stateMachineRole.attachInlinePolicy(
      new iam.Policy(this, "cloudWatchPolicy", {
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
              "logs:DescribeLogGroups",
            ],
            resources: ["*"],
            effect: iam.Effect.ALLOW,
          }),
        ],
      })
    );

    stateMachineRole.attachInlinePolicy(
      new iam.Policy(this, "EcsTaskPolicySM", {
        statements: [
          new iam.PolicyStatement({
            actions: ["ecs:runTask"],
            resources: [ecsTask.taskDefinitionArn],
            effect: iam.Effect.ALLOW,
          }),
        ],
      })
    );

    stateMachineRole.attachInlinePolicy(
      new iam.Policy(this, "InvokeLambdaPolicy", {
        statements: [
          new iam.PolicyStatement({
            actions: ["lambda:InvokeFunction"],
            resources: ["*"],
            effect: iam.Effect.ALLOW,
          }),
        ],
      })
    );

    stateMachineRole.attachInlinePolicy(
      new iam.Policy(this, "batchPolicy", {
        statements: [
          new iam.PolicyStatement({
            actions: ["batch:*", "events:*"],
            resources: ["*"],
            effect: iam.Effect.ALLOW,
          }),
        ],
      })
    );

    stateMachineRole.attachInlinePolicy(
      new iam.Policy(this, "sfnIamPolicy", {
        statements: [
          new iam.PolicyStatement({
            actions: ["iam:GetRole", "iam:PassRole"],
            resources: ["*"],
            effect: iam.Effect.ALLOW,
          }),
        ],
      })
    );

    stateMachineRole.attachInlinePolicy(
      new iam.Policy(this, "XrayPolicy", {
        statements: [
          new iam.PolicyStatement({
            actions: [
              "xray:PutTraceSegments",
              "xray:PutTelemetryRecords",
              "xray:GetSamplingRules",
              "xray:GetSamplingTargets",
            ],
            resources: ["*"],
            effect: iam.Effect.ALLOW,
          }),
        ],
      })
    );

    // Step function created using above definition
    const stepFunction = new sfn.StateMachine(this, "StateMachine", {
      definition: stepFuncDefinition,
      stateMachineName: "IntegralsStateMachine",
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
      },
      role: stateMachineRole,
    });

    // Output the ECR Repository URI, push docker image here
    new CfnOutput(this, "ecrRepoUri", {
      value: repo.repositoryUri,
      description: "ECR Repository for this stack, push Docker image here.",
    });
  }

  private submitEcsTask(id: string, taskQueue: sqs.Queue) {
    return new tasks.SqsSendMessage(this, id, {
      queue: taskQueue,
      messageBody: sfn.TaskInput.fromObject({
        token: sfn.JsonPath.taskToken,
        input: sfn.TaskInput.fromJsonPathAt('$'),
      }),
      outputPath: '$',
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
    });
  }
}
