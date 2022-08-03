import { Stack, StackProps } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib'
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    // The code that defines your stack goes here
    const repo = new ecr.Repository(this,'testrepository', {
      encryption: ecr.RepositoryEncryption.KMS
    });

    new cdk.CfnOutput(this,'repoName',{
      value: repo.repositoryUri,
      description: 'Repository URI'
    })
  }
}
