'use strict';

/**
 * bootstrapTemplate.js — the connect-account CloudFormation template as a JS
 * object. Canonical source for the in-app download (served as YAML or JSON).
 * Mirrors infra/connect-account/stack.yaml; long-form intrinsics so it
 * serializes cleanly to both formats. Both are valid CloudFormation templates.
 */

module.exports = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description:
    'Mapdoc Visual Cloud Builder — connect this AWS account. Creates a cross-account '
    + 'Connect role (assumable only by Mapdoc with your ExternalId), an in-account Runner '
    + 'role + CodeBuild project that runs Terraform, and a durable Terraform state backend '
    + '(S3 + DynamoDB). Mapdoc never receives your keys.',

  Parameters: {
    PlatformAccountId: {
      Type: 'String',
      Description: "Mapdoc's AWS account id (shown on the Connect screen).",
      AllowedPattern: '^[0-9]{12}$',
    },
    ExternalId: {
      Type: 'String',
      Description: 'One-time ExternalId shown on the Connect screen.',
      MinLength: 8,
      NoEcho: true,
    },
    RunnerPolicyArn: {
      Type: 'String',
      Default: 'arn:aws:iam::aws:policy/PowerUserAccess',
      Description: 'Permissions the Terraform runner gets in THIS account (default PowerUserAccess; excludes IAM/root).',
    },
  },

  Resources: {
    StateBucket: {
      Type: 'AWS::S3::Bucket',
      Properties: {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }],
        },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true,
        },
        VersioningConfiguration: { Status: 'Enabled' },
        // Expire the ephemeral prefixes (uploaded source + result blobs) after a day.
        // Versioning is on for state/, so we must also expire NONCURRENT versions —
        // a plain delete only writes a marker and leaves the bytes behind. state/ is
        // deliberately NOT covered so Terraform state + its history are retained.
        LifecycleConfiguration: {
          Rules: ['source/', 'deploy/', 'results/'].map((p) => ({
            Id: `expire-${p.replace('/', '')}`,
            Status: 'Enabled',
            Prefix: p,
            ExpirationInDays: 1,
            NoncurrentVersionExpiration: { NoncurrentDays: 1 },
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
          })),
        },
      },
    },

    LockTable: {
      Type: 'AWS::DynamoDB::Table',
      Properties: {
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [{ AttributeName: 'LockID', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'LockID', KeyType: 'HASH' }],
      },
    },

    RunnerRole: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [{ Effect: 'Allow', Principal: { Service: 'codebuild.amazonaws.com' }, Action: 'sts:AssumeRole' }],
        },
        ManagedPolicyArns: [{ Ref: 'RunnerPolicyArn' }],
        Policies: [{
          PolicyName: 'terraform-state',
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
                Resource: [{ 'Fn::GetAtt': ['StateBucket', 'Arn'] }, { 'Fn::Sub': '${StateBucket.Arn}/*' }],
              },
              {
                Effect: 'Allow',
                Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem'],
                Resource: { 'Fn::GetAtt': ['LockTable', 'Arn'] },
              },
            ],
          },
        }],
      },
    },

    RunnerProject: {
      Type: 'AWS::CodeBuild::Project',
      Properties: {
        Name: { 'Fn::Sub': 'mapdoc-runner-${AWS::StackName}' },
        ServiceRole: { 'Fn::GetAtt': ['RunnerRole', 'Arn'] },
        Artifacts: { Type: 'NO_ARTIFACTS' },
        Environment: { Type: 'LINUX_CONTAINER', ComputeType: 'BUILD_GENERAL1_SMALL', Image: 'hashicorp/terraform:1.9' },
        Source: {
          Type: 'NO_SOURCE',
          BuildSpec: 'version: 0.2\nphases:\n  build:\n    commands:\n      - echo "Buildspec is supplied at StartBuild time by Mapdoc (plan/apply)."\n',
        },
        TimeoutInMinutes: 30,
      },
    },

    ConnectRole: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: { AWS: { 'Fn::Sub': 'arn:aws:iam::${PlatformAccountId}:root' } },
            Action: 'sts:AssumeRole',
            Condition: { StringEquals: { 'sts:ExternalId': { Ref: 'ExternalId' } } },
          }],
        },
        Policies: [{
          PolicyName: 'launch-runner',
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: ['codebuild:StartBuild', 'codebuild:BatchGetBuilds', 'codebuild:StopBuild'],
                Resource: { 'Fn::GetAtt': ['RunnerProject', 'Arn'] },
              },
              { Effect: 'Allow', Action: 'iam:PassRole', Resource: { 'Fn::GetAtt': ['RunnerRole', 'Arn'] } },
              {
                Effect: 'Allow',
                Action: ['s3:GetObject', 's3:ListBucket'],
                Resource: [{ 'Fn::GetAtt': ['StateBucket', 'Arn'] }, { 'Fn::Sub': '${StateBucket.Arn}/*' }],
              },
              { Effect: 'Allow', Action: ['logs:GetLogEvents', 'logs:FilterLogEvents'], Resource: '*' },
            ],
          },
        }],
      },
    },
  },

  Outputs: {
    ConnectRoleArn: { Description: 'Paste this back into Mapdoc to finish connecting.', Value: { 'Fn::GetAtt': ['ConnectRole', 'Arn'] } },
    StateBucket: { Value: { Ref: 'StateBucket' } },
    LockTable: { Value: { Ref: 'LockTable' } },
    RunnerProject: { Value: { Ref: 'RunnerProject' } },
  },
};
