import { Stack, StackProps } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib'
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam' 
import * as s3 from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs';

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    // The code that defines your stack goes here
    const repo = new ecr.Repository(this,'testrepository', {
      encryption: ecr.RepositoryEncryption.KMS
    });

    const bucket = new s3.Bucket(this,"testS3",{
      autoDeleteObjects: true,
      bucketName: "TestBucket"
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

    new cdk.CfnOutput(this,'repoName',{
      value: repo.repositoryUri,
      description: 'Repository URI'
    })
  }
}
