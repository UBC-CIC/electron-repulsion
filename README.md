# electron-repulsion

Orchestration for calculating election repulsion integrals in the cloud

## Development

This repository uses git submodules. Therefore you must run this command after cloning:

    git submodule update --init

There are three main components in this library:

1. A `Dockerfile` for building and containerizing the `integrals` application
2. AWS CDK definitions in `cdk` for deploying and managing AWS resources
3. A command line library in `cli` for managing data and process on AWS

## Deploying

There are a few automated steps to deploying the solution to your AWS environment

1. Building the `integrals` image
2. Deploying CDK resources
3. Pushing the `integrals` image

These instructions require that you are using the `bash` shell in a `POSIX`-compliant environment.
This means Linux, Mac, or Windows with WSL2. You will need the following programs installed:

* `node` and `npm`
* `docker`
* `aws`

These should be readily available from your package manager.

### Building the integrals image

You will need `docker` installed, and you will need the submodule updated as instructed above. Run the
following command to build and tag the `integrals` image locally:

    ./scripts/build_image.sh

### Deploying CDK resources

We use AWS CDK to manage cloud resources in such a way that we can easily replicate our setup in other
users' environments. To use our definitions, you will need to install the `cdk` utility, which you can do with

    npm install -g aws-cdk

You can verify that `cdk` is installed correctly on your path with

    cdk --version

CDK determines the AWS environment it manipulates through all the normal means. Typically this will be through
environment variables like `AWS_PROFILE`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, etc. (This is exactly how
how `aws-cli` works, so we will not go into much more detail here, except to say that you should be able to
confirm access in your current shell with `aws sts get-caller-identity`. It is enough to set `AWS_PROFILE` and
`AWS_REGION` in the shell.)

CDK groups deployable things in named "stacks." We have the following stacks (in dependency order):

1. `CdkStack` - All resources, including S3 buckets, ECS clusters, Lambda and Step Function definitions, etc.

There are options in the `cdk` utility to operate per-stack, but by default it operates on all stacks.

In the `cdk` directory, you can execute the following commands to initialize and deploy:

    # Required: Install dependencies
    npm install

    # Optional: Print out a CloudFormation template with all managed resources
    cdk synth

    # Required: Bootstrap CDK in your environment
    cdk bootstrap

    # Deploy the current resources (potentially just updating changed resources, or doing nothing if up-to-date)
    # You need to pass required parameters at deploy time.
    cdk deploy --parameters CdkStack:bucketName=${YOUR_DESIRED_S3_BUCKET_TO_CREATE}

As you pull new versions of our CDK code, you can `cdk synth` and `cdk deploy` at your convenience. If you want to
tear down your environment, you can run `cdk destroy`.

### Pushing the integrals image

Now that CDK has initialized all our resources, we need to push the `integrals` image to the ECR repo it has
created. You can do that with

    ./scripts/build_image.sh

Note that this script assumes the ability to read AWS configuration from environment variables.

## Running with the command line interface

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

## A very simple invocation

You will need AWS environment variables set in your shell (`AWS_DEFAULT_REGION` and `AWS_PROFILE` work):

  ./cli.sh execute-state-machine --help
