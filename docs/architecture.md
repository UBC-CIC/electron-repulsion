# Architecure Deep Dive

## High Level Architecture

![Architecture1](images/overall_arch.png)

### Description

1. A command-line interface (CLI) is used to interact with the Step Functions workflow. The operations that the CLI supports are:
    - `execute_state_machine`: Execute a job.
    - `get_status`: Check the status of the job. Gives the name of the current state and, if the job failed, gives the name of the state that failed.
    - `get_execution_list`: A list of all recent jobs (by job IDs) and their status (e.g. RUNNING, ABORTED, etc.).
    - `abort_execution`: Abort a currently running job.
    - `delete_job_files`: Delete all files related to a job ID from the S3 bucket.
    - `download_files_from_bucket`: Download all files related to a job ID from the S3 bucket to the local computer running the CLI.
2. The step functions workflow consists of services running one after the other to execute the integrals job.
3. The Amazon S3 Bucket serves as an object store that stores the binary and JSON files generated and accessed by the step functions workflow.

## Step Function Architecture

![Architecture2](images/step_functions_arch.png)


### Description

#### info step (4)

4. The first state of the state machine takes in inputs from the CLI and executes an ECS task, which runs the info step and stores the result as a JSON file in the S3 bucket (3).

#### Parallel execution (5)

5. The next four calculations are independent of each other and are therefore executed in parallel in the state machine.

#### core_hamiltonian step (6,7,8)

6. This “modify inputs” step adds `{ stepName: “core_hamiltonian” }` to the input and passes the newly formed object to the next step to tell the following Lambda function which calculation to set up for.
7. This step calls the setupCalculations Lambda function, which sets up parameters to run the core_hamiltonian step.
8. The next step runs an ECS task which takes in parameters from the previous Lambda and the ‘integrals’ Docker image from the ECR repository. The core_hamiltonian step is executed in this ECS container. The standard output generated during the calculation is stored as a JSON file and the calculation result is stored as a binary file in the S3 bucket (3).


#### overlap step (9,10,11)

6. This “modify inputs” step adds `{ stepName: “overlap” }` to the input and passes the newly formed object to the next step to tell the following Lambda function which calculation to set up for.
7. This step calls the setupCalculations Lambda function, which sets up parameters to run the overlap step.
8. The next step runs an ECS task which takes in parameters from the previous Lambda and the ‘integrals’ Docker image from the ECR repository. The overlap step is executed in this ECS container. The standard output generated during the calculation is stored as a JSON file and the calculation result is stored as a binary file in the S3 bucket (3).

#### initial_guess step (12,13,14)

12. This “modify inputs” step adds `{ stepName: “initial_guess” }` to the input and passes the newly formed object to the next step to tell the following Lambda function which calculation to set up for.
13. This step calls the setupCalculations Lambda function, which sets up parameters to run the initial_guess step.
14. The next step runs an ECS task which takes in parameters from the previous Lambda and the ‘integrals’ Docker image from the ECR repository. The initial_guess step is executed in this ECS container. The standard output generated during the calculation is stored as a JSON file and the calculation result is stored as a binary file in the S3 bucket (3).

#### two_electrons_integrals step (15,16,17,18)

15. This step calls the setupTei Lambda which reads the JSON file produced during the info step (4) to get the `basis_set_instance_size` of the calculation. It then uses this value to determine the calculation split ranges, hence preparing to split the calculation into `numSlices` parts. This `numSlices` value is either specified by the user using the CLI, or determined automatically by the function by estimating the memory usage of each part. The split ranges are saved in a text format in the S3 bucket. All other calculation setup tasks are also done in this step.
16. A conditional in the state machine checks the outputs from the previous state to determine if AWS Batch is to be used.
17. If AWS Batch is not being used, then the two_electrons_integrals step runs normally as an ECS task, and calculates integrals within ranges 0,0,0,0 to *n*,0,0,0 where *n* is the `basis_set_instance_size`. The ECS task runs on a container which pulls the ‘integrals’ image from ECR. The standard output generated during the calculation is stored as a JSON file and the calculation result is stored as a binary file in the S3 bucket (3).
18. If AWS Batch is being used, the text file generated in the setupTei Lambda function (15) is used to distribute tasks to each of the numSlices batch jobs. Each job produces two outputs for the S3 bucket (3), a binary file and a JSON file. The binary files include the ranges for that job in their name to differentiate one from the other. The JSON files include the index of the job (0, 1, 2, ...) to differentiate one from the other.

#### Initialize loop variables (19)

19. A loopData dictionary is added to the inputs. This dictionary keeps track of the number of iterations as well as the difference between the `hartree_fock_energy` calculated during the last two scf_step (26) calculations.

#### Loop condition (20)

20. The loop terminates if the number of iterations have reached a specified limit (either as an input through the CLI or a default value) or the difference between the last two values of the `hartree_fock_energy` falls below a threshold value (either as an input through the CLI or a default value).

#### fock_matrix step (21,22,23)

21. This “modify inputs” step adds `{ stepName: “fock_matrix” }` to the input and passes it to the next step to tell the following Lambda function which calculation to set up for.
22. This step calls the setupCalculations Lambda function which sets up parameters to run the fock_matrix step.
23. The next step runs an ECS task which takes in parameters from the previous Lambda and the ‘integrals’ Docker image from the ECR repository. The fock_matrix step is executed in this ECS container. The standard output generated during the calculation is stored as a JSON file and the calculation result is stored as a binary file in the S3 bucket (3).

#### scf_step (24,25,26)

24. This “modify inputs” step adds `{ stepName: “scf_step” }` to the input and passes it to the next step to tell the following Lambda function which calculation to set up for.
25. This step calls the setupCalculations Lambda function which sets up parameters to run the scf_step.
26. The next step runs an ECS task which takes in parameters from the previous Lambda and the ‘integrals’ Docker image from the ECR repository. The scf_step is executed in this ECS container. The standard output generated during the calculation is stored as a JSON file and the calculation result is stored as a binary file in the S3 bucket (3).

#### Update loop variables (27)

27. The loopData dictionary is updated. The number of iterations is increased by 1 and a new value of `hartree_diff`, which is the difference between the last two values of the `hartree_fock_energy`, is calculated.
 
#### Success (28)

28. If either one of the conditions are met (maximum number of iterations reached or minimum value of `hartree_diff` reached), the loop terminates and the step function execution is marked as successful.
