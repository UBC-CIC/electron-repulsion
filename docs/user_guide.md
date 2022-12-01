# User Guide

The Command-Line Interface (CLI) in this project can be used to execute calculations on the AWS Step Functions. Follow this guide to learn how to do that.

**Note:** You need to follow all the instructions in the [Deployment Guide](./deployment.md) before being able to use the CLI.

First, change directory to `cli` using `cd cli`. Now, you can view the possible commands using:

```bash
./cli.sh --help
```

Once you have deciced the command you want to execute, run the following command to get the list of arguments (and their data type) that you need to pass:

```bash
./cli.sh <command> --help
```

This tables gives a summary of all things you can do with the CLI:

|   Command    |        About         |          Example           |
|   :----:     |        :----:        |          :----:            |
|  abort-execution | Aborts execution of a recent job | `./cli.sh abort-execution --jobid=12345abcd --bucket=integrals-bucket` |
