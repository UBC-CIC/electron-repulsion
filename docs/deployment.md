This document covers the instructions you need to follow before you can run you first calculation.

# Requirements

Before you deploy, you must have the following in place:

* The `bash` shell in a `POSIX`-compliant environment which means Linux, Mac, or Windows with WSL2
* [AWS Account](https://aws.amazon.com/account/)
* [GitHub Account](https://github.com/)
* [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
* [Node/npm](https://nodejs.org/en/download/)
* [AWS CLI](https://aws.amazon.com/cli/)
* [Docker](https://docs.docker.com/get-docker/)


# Step 1: Clone The Repository

1. Select a folder to hold the code in this repository, or create a new one.
2. Open the terminal (or command prompt on Windows) and `cd` into the above folder.
3. Clone this github repository by entering the following:
```bash
git clone https://github.com/UBC-CIC/electron-repulsion.git
```
4. Navigate into the electron-repulsion folder by running the following command:
```bash
cd electron-repulsion
```
5. Since this repository uses git submodules, you must run this command after cloning:
```bash
git submodule update --init
```

# Step 2: Building The Image

Start Docker on your system if it is not already running. Run the following command to build and tag the integrals image locally:

```bash
./scripts/build_image.sh
```

# Step 3: Deploying CDK Resources

We use AWS CDK to manage cloud resources in such a way that we can easily replicate our setup in other users' environments. To use our definitions, you will need to install the cdk utility, which you can do with:

```bash
npm install -g aws-cdk
```

You can verify that cdk is installed correctly on your path with:

```bash
cdk --version
```

CDK determines the AWS environment it manipulates through all the normal means. Typically this will be through environment variables like `AWS_PROFILE`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, etc. (This is exactly how `aws-cli` works, so we will not go into much more detail here, except to say that you should be able to confirm access in your current shell with `aws sts get-caller-identity`. It is enough to set `AWS_PROFILE` and `AWS_REGION` in the shell.)

CDK groups deployable things in named "stacks." We have the following stacks (in dependency order):

1. `CdkStack` - All resources, including S3 buckets, ECS clusters, Lambda and Step Function definitions, etc.

There are options in the `cdk` utility to operate per-stack, but by default it operates on all stacks.

In the `cdk` directory, you can execute the following commands to initialize and deploy:

```bash
# Required: Install dependencies
npm install

# Optional: Print out a CloudFormation template with all managed resources
cdk synth

# Required: Bootstrap CDK in your environment
cdk bootstrap

# Deploy the current resources (potentially just updating changed resources, or doing nothing if up-to-date)
# You need to pass required parameters at deploy time.
cdk deploy --parameters CdkStack:bucketName=${YOUR_DESIRED_S3_BUCKET_TO_CREATE}
```

As you pull new versions of our CDK code, you can `cdk synth` and `cdk deploy` at your convenience. If you want to tear down your environment, you can run `cdk destroy`. Note that you may have to delete the ECR image manually (or use `scripts/delete_image.sh`). Be warned that destroying the stack will remove the S3 bucket with calculation results!

# Step 4: Pushing The Image

Now that CDK has initialized all our resources, we need to push the `integrals` image to the ECR repo it has created. You can do that with:

```bash
./scripts/build_image.sh
```

Note that this script assumes the ability to read AWS configuration from environment variables.

There is a shortcut around building if you have access to another account with the image already in it:

```bash
AWS_PROFILE=NAME_OF_THE_SOURCE_ACCOUNT ./scripts/pull_image.sh
AWS_PROFILE=NAME_OF_THE_DESTINATION_ACCOUNT AWS_DEFAULT_REGION=ca-central-1 ./scripts/push_image.sh
```

# Step 5: Setting up the CLI (Command-Line Interface)

There is a small Python library/application in `cli` that allows you to run and monitor jobs without having to know too much about the AWS resources themselves. Its dependencies are managed by `pip`, and you can initialize a virtual environment and run the CLI with:

```bash
# In the cli dir
# Install the dependencies needed to run the CLI
make venv

# Or equivalently
python3 -m venv .venv
.venv/bin/pip install -e .

# Run the CLI
./cli.sh --help

# Or equivalently
.venv/bin/python -m cli.main --help
```

See the `Makefile` for other development tasks (such as `make test`).

The interface is packaged as a Python library (with a `setup.py`) so you can depend on it in your own `pip` projects.

Now that the cloud resources have been deployed and the CLI has been set up, you can run your first calculation. Visit the [User Guide](./user_guide.md) for instructions on how to do that.

