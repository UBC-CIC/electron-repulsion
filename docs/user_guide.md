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
|   :----     |        :----        |          :----         |
| execute-state-machine | Starts a calculation, given a set of input parameters | `./cli.sh execute-state-machine --xyz https://link/to/xyz/file.xyz --basis_set sto-3g --bucket integrals-bucket --batch_execution true --epsilon 0.01 --max_iter 35` |
|  abort-execution | Aborts execution of a recent job. You can specify the job you want to abort using the job id. | `./cli.sh abort-execution --jobid 12345abcd --bucket integrals-bucket` |
| download-job-files | Downloads all files related to a given job from the S3 bucket to the user's local computer. You need to specify the absolute path of the target directory where you want the downlaod the files to. | `./cli.sh download-job-files --jobid 12345abcd --bucket integrals-bucket --target /path/to/target` |
| delete-job-files | Deletes all files related to a given job from the S3 bucket | `./cli.sh delete-job-files --jobid 12345abcd --bucket integrals-bucket` |
| get-status | Get status of a recent job. If the status is RUNNING, get the name of the current state. If the status is FAILED, gives the reason for failure, if the status is SUCCEEDED, gives the final value for the hartree_fock_energy. | `./cli.sh get-status --jobid 12345abcd --bucket integrals-bucket` |
| get-execution-list | List recent jobs by job id and status (RUNNING, FAILED, SUCCEEDED, OR ABORTED) | `./cli.sh get-execution-list --bucket integrals-bucket` |


