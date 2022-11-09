import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as batch from "aws-cdk-lib/aws-batch";
import { Construct } from "constructs";
import { ManagedPolicy } from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";

export class CdkStack extends Stack {
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
      return new lambda.Function(this, id, {
        runtime: lambda.Runtime.PYTHON_3_9,
        handler: "lambda_function.lambda_handler",
        code: lambda.Code.fromAsset(codePath),
        role: setupLambdaRole,
        functionName: name,
        timeout: cdk.Duration.seconds(20),
        memorySize: 256,
        environment: {
          ER_S3_BUCKET: bucketName.valueAsString,
        },
      });
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
     * CDK Helper Function - Returns a default configuration ECSRunTask step for use in the step function,
     * uses the containerDefinition containerDef created in this CDK stack
     * id: CDK Id of the resource
     */
    const cdkEcsRunTaskSfn = (id: string): tasks.EcsRunTask => {
      return new tasks.EcsRunTask(this, id, {
        cluster: cluster,
        launchTarget: new tasks.EcsFargateLaunchTarget(),
        taskDefinition: ecsTask,
        containerOverrides: [
          {
            containerDefinition: containerDef,
            command: sfn.JsonPath.listAt("$.commands"),
            environment: [
              {
                name: "JSON_OUTPUT_PATH",
                value: sfn.JsonPath.stringAt("$.s3_bucket_path"),
              },
            ],
          },
        ],
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        assignPublicIp: true,
        resultPath: "$.output",
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
    });

    // The ECS Cluster used to run ECS Fargate instances
    const cluster = new ecs.Cluster(this, "integralsCluster", {
      clusterName: "Integrals-CDK-Cluster",
    });

    // We will use the same VPC as created by the cluster in the entire stack
    const vpc = cluster.vpc;

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
      ],
    });

    // Task definition for all ECS tasks. Change the cpu and memoryMiB to change the resource availability of each Fargate task
    const ecsTask = new ecs.TaskDefinition(this, "ecsTask", {
      compatibility: ecs.Compatibility.FARGATE,
      executionRole: ecsTaskRole,
      taskRole: ecsTaskRole,
      cpu: "1024",
      memoryMiB: "4096",
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      family: "IntegralsTaskDefinition",
    });

    // Container definition for each task, uses the latest image in the ECR repository
    const containerDef = ecsTask.addContainer("container", {
      image: ecs.ContainerImage.fromEcrRepository(repo, "latest"),
      containerName: "integralsExecution",
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "electron-repulsion" }),
    });

    /**
     * STATE MACHINE
     */

    // Info step
    const integralsInfoStep = cdkEcsRunTaskSfn("IntegralInfo");

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

    // Creating LambdaInvoke steps for all Lambda functions
    const setupTeiStep = cdkLambdaInvokeSfn("setupTeiStep", setupTeiLambda);
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
    const coreHamiltonianStep = cdkEcsRunTaskSfn("coreHamiltonianStep");

    // Overlap Matrix parallel step
    const overlapMatrixStep = cdkEcsRunTaskSfn("overlapMatrixStep");

    // Initial Guess parallel step
    const initialGuessStep = cdkEcsRunTaskSfn("initialGuessStep");

    // Sequential way to run two_electrons_integrals step
    const integralsTwoElectronsIntegralsSeqStep = cdkEcsRunTaskSfn("IntegralsTEI");

    // Fock Matrix step
    const fockMatrixStep = cdkEcsRunTaskSfn("fockMatrixStep");

    // Scf Step
    const scfStep = cdkEcsRunTaskSfn("scfStep");

    // AWS Batch way of running two_electrons_integrals step (including Batch setup)

    // Role for the spot fleet
    const spotFleetRole = new iam.Role(this, "spotFleetRole", {
      roleName: "AmazonEC2SpotFleetRole",
      assumedBy: new iam.ServicePrincipal("spotfleet.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(
          this,
          "sptFleetRole",
          "arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetTaggingRole"
        ),
      ],
    });

    // Role for each of the Batch instances (include S3 Full Access)
    const batchInstanceRole = new iam.Role(this, "batchInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "Role for Batch Instances",
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(
          this,
          "ecsTaskPolicy2",
          "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
        ),
        ManagedPolicy.fromManagedPolicyArn(this, "ecsBucketPolicy3", "arn:aws:iam::aws:policy/AmazonS3FullAccess"),
      ],
    });

    const EcsInstanceProfile = new iam.CfnInstanceProfile(this, "ECSInstanceProfile", {
      instanceProfileName: batchInstanceRole.roleName,
      roles: [batchInstanceRole.roleName],
    });

    const batchServiceRole = new iam.Role(this, "batchServiceRole", {
      roleName: "batchServiceRole",
      assumedBy: new iam.ServicePrincipal("batch.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(
          this,
          "BatchServiceRole",
          "arn:aws:iam::aws:policy/service-role/AWSBatchServiceRole"
        ),
      ],
    });

    // The compute environment for Batch - increase maxvCpus to increase the number of jobs that can be run parallelly
    // For example, if incstances with 2 vCpus each are used and maxcCpus = 16, then only 8 instaces can be running parallelly
    const batchComputeEnv = new batch.CfnComputeEnvironment(this, "computeEnv", {
      computeEnvironmentName: "batch-compute-environment",
      type: "MANAGED",
      serviceRole: batchServiceRole.roleArn,
      computeResources: {
        type: "SPOT",
        spotIamFleetRole: spotFleetRole.roleArn,
        maxvCpus: 16,
        minvCpus: 0,
        instanceRole: EcsInstanceProfile.attrArn,
        instanceTypes: ["optimal"],
        // might need to change this if a manually created VPC is used for the cluster
        subnets: [vpc.publicSubnets[0].subnetId, vpc.publicSubnets[1].subnetId],
        securityGroupIds: [securityGroup.securityGroupId],
      },
    });

    // The job queue for Batch
    const batchJobQueue = new batch.CfnJobQueue(this, "jobQueue", {
      priority: 10,
      jobQueueName: "batchJobQueue",
      computeEnvironmentOrder: [
        {
          computeEnvironment: batchComputeEnv.attrComputeEnvironmentArn,
          order: 1,
        },
      ],
    });

    // Job defnition for Batch, uses the latest image in the ECR repository
    // Change vcpus and memory to change resources available to each individual batch job
    const batchJobDefinition = new batch.CfnJobDefinition(this, "jobDef", {
      type: "container",
      containerProperties: {
        image: ecs.ContainerImage.fromEcrRepository(repo, "latest").imageName,
        executionRoleArn: ecsTaskRole.roleArn,
        vcpus: 1,
        memory: 4096,
      },
      jobDefinitionName: "batch_job_definition",
      platformCapabilities: ["EC2"],
      retryStrategy: {
        attempts: 2,
      },
    });

    // BatchSubmitJob step for the step function
    const batchSubmitJobTask = new tasks.BatchSubmitJob(this, "batchSubmitJobTask", {
      jobDefinitionArn: `arn:aws:batch:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:job-definition/${batchJobDefinition.jobDefinitionName}`,
      jobName: "tei_batch_job_submission",
      jobQueueArn: batchJobQueue.attrJobQueueArn,
      containerOverrides: {
        command: sfn.JsonPath.listAt("$.commands"),
        environment: {
          JSON_OUTPUT_PATH: sfn.JsonPath.stringAt("$.s3_bucket_path"),
          ARGS_PATH: sfn.JsonPath.stringAt("$.args_path"),
        },
      },
      arraySize: sfn.JsonPath.numberAt("$.numSlices"),
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
    });

    const logGroup = new logs.LogGroup(this, "LogGroup");

    // Step function condition to choose whether Batch step is used or the sequential step (ECS) for two_electrons_integrals
    const batchCondition = sfn.Condition.and(
      sfn.Condition.stringEquals("$.batch_execution", "true"),
      sfn.Condition.numberGreaterThan("$.numSlices", 1)
    );

    // Condition to determine whether the Fock-SCF loop will continue
    const loopCondition = sfn.Condition.and(
      sfn.Condition.numberLessThanEqualsJsonPath("$.loopData.loopCount", "$.max_iter"),
      sfn.Condition.numberGreaterThanJsonPath("$.loopData.hartree_diff", "$.epsilon")
    );

    // Change this to change batch execution workflow
    const batchExecWorkflow = new sfn.Choice(this, "batchExec")
      // Batch execution
      .when(batchCondition, batchSubmitJobTask)
      // No Batch execution
      .otherwise(integralsTwoElectronsIntegralsSeqStep);

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
          .branch(modifyInputsCoreHamiltonian.next(setupCoreHamiltonianStep).next(coreHamiltonianStep))
          .branch(modifyInputsOverlap.next(setupOverlapMatrixStep).next(overlapMatrixStep))
          .branch(modifyInputsInitialGuess.next(setupInitialGuessStep).next(initialGuessStep))
          .branch(setupTeiStep.next(batchExecWorkflow))
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
}
