import { Stack } from 'aws-cdk-lib';
import { CfnVPC, Vpc, VpcProps } from 'aws-cdk-lib/aws-ec2';
import {
    AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId
} from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class BaseVpc extends Vpc {

    constructor(
        scope: Construct,
        id: string,
        props: VpcProps) {

        super(
            scope,
            id,
            props);

        // Configure default security group according to "CIS AWS Foundations Benchmark controls",
        // section "4.3 – Ensure the default security group of every VPC restricts all traffic".
        // See https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-cis-controls.html#securityhub-cis-controls-4.3

        const cfnVpc = this.node.defaultChild as CfnVPC;

        const stack = Stack.of(this);

        const ingressParameters = {
            GroupId: cfnVpc.attrDefaultSecurityGroup,
            IpPermissions: [
                {
                    IpProtocol: '-1',
                    UserIdGroupPairs: [
                        {
                            GroupId: cfnVpc.attrDefaultSecurityGroup,
                        },
                    ],
                },
            ],
        };

        new AwsCustomResource(
            this,
            'RestrictSecurityGroupIngress',
            {
                onCreate: {
                    service: 'EC2',
                    action: 'revokeSecurityGroupIngress',
                    parameters: ingressParameters,
                    physicalResourceId: PhysicalResourceId.of(`restrict-ingress-${this.vpcId}-${cfnVpc.attrDefaultSecurityGroup}`),
                },
                onDelete: {
                    service: 'EC2',
                    action: 'authorizeSecurityGroupIngress',
                    parameters: ingressParameters,
                },
                policy: AwsCustomResourcePolicy.fromSdkCalls({
                    resources: [`arn:aws:ec2:${stack.region}:${stack.account}:security-group/${cfnVpc.attrDefaultSecurityGroup}`],
                }),
            });

        const egressParameters = {
            GroupId: cfnVpc.attrDefaultSecurityGroup,
            IpPermissions: [
                {
                    IpProtocol: '-1',
                    IpRanges: [
                        {
                            CidrIp: '0.0.0.0/0',
                        },
                    ],
                },
            ],
        };

        new AwsCustomResource(
            this,
            'RestrictSecurityGroupEgress',
            {
                onCreate: {
                    service: 'EC2',
                    action: 'revokeSecurityGroupEgress',
                    parameters: egressParameters,
                    physicalResourceId: PhysicalResourceId.of(`restrict-egress-${this.vpcId}-${cfnVpc.attrDefaultSecurityGroup}`),
                },
                onDelete: {
                    service: 'EC2',
                    action: 'authorizeSecurityGroupEgress',
                    parameters: egressParameters,
                },
                policy: AwsCustomResourcePolicy.fromSdkCalls({
                    resources: [`arn:aws:ec2:${stack.region}:${stack.account}:security-group/${cfnVpc.attrDefaultSecurityGroup}`],
                }),
            });
    }
}
