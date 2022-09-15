# electron-repulsion

Orchestration for calculating election repulsion integrals in the cloud

## Development

This repository uses git submodules. Therefore you must run this command after cloning:

    git submodule update --init

There are three main components in this library:

1. A `Dockerfile` for building and containerizing the `integrals` application
2. AWS CDK definitions in `cdk` for deploying and managing AWS resources
3. A command line library in `cli` for managing data and process on AWS

## Deploying to AWS

We use AWS CDK to manage cloud resources in such a way that we can easily replicate our setup in other
users' environments. To use our definitions, you will need to install the `cdk` utility, which you can do with

    npm install -g aws-cdk

You can verify that `cdk` is installed correctly on your path with

    cdk --version

CDK determines the AWS environment it manipulates through all the normal means. Typically this will be through
environment variables like `AWS_PROFILE`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, etc. (This is exactly how
how `aws-cli` works, so we will not go into any more detail here, except to say that you should be able to
confirm access in your current shell with `aws sts get-caller-identity`.)

CDK groups deployable things in named "stacks." We have the following stacks (in dependency order):

1. `CdkStack` - All resources, including S3 buckets, ECS clusters, Lambda and Step Function definitions, etc.

There are options in the `cdk` utility to operate per-stack, but by default it operates on all stacks.

In the `cdk` directory, you can execute the following commands:

    # Print out a CloudFormation template with all managed resources
    cdk synth

    # Deploy the current resources (potentially just updating changed resources, or doing nothing if up-to-date)
    cdk synth

    # Remove all managed resources
    cdk destroy

## Using the command line interface

There is a small Python library/application in `cli` that allows you to run and monitor jobs without having
to know too much about the AWS resources themselves. Its dependencies are managed by `pip`, and you can
initialize a virtual environment and run the CLI with:

    # In the cli dir
    make venv

    # Run the CLI
    ./cli.sh --help

    # Equivalent
    .venv/bin/python -m cli.main --help

See the `Makefile` for other development tasks (such as `make test`).

The interface is packaged as a Python library (with a `setup.py`) so you can depend on it in your own `pip`
projects.
