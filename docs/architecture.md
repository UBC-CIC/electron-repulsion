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
2. The step functions workflow consists of services running one after the other to orchestrate the tasks of the integrals job.
3. The Amazon SQS holds the tasks that need to be executed.
4. The Amazon ECS that consists of Fargate and EC2 service providers that fetch the tasks from the queue and execute them.
5. The Amazon S3 Bucket serves as an object store that stores the binary and JSON files generated and accessed by the step functions workflow.
6. The AWS Lambda to abort the execution of a job in a step function and mark the job as deleted in the job status database.
7. Amazon DynamoDB serves as as a job status board and holds the deleted tasks and the remaining integrals tasks.
8. AWS AutoScaling checks the status of the queue and increases/decreases the number of ECS tasks when necessary.

## Step Function Architecture

![Architecture2](images/step_functions_arch.png)


### Description

#### info step (9)

9. The first state of the state machine takes in inputs from the CLI and pushes a task in the queue (3), which eventually runs the info step and stores the result as a JSON file in the S3 bucket (5).

#### Parallel execution (10)

10. The next four calculations are independent of each other and are therefore executed in parallel in the state machine.

#### core_hamiltonian step (11,12,13)

11. This “modify inputs” step adds `{ stepName: “core_hamiltonian” }` to the input and passes the newly formed object to the next step to tell the following Lambda function which calculation to set up for.
12. This step calls the setupCalculations Lambda function, which sets up parameters to run the core_hamiltonian step.
13. The next step pushes the core_hamiltonian task in the queue (3) which takes in parameters from the previous Lambda and the ‘integrals’ Docker image from the ECR repository. The standard output generated during the calculation is stored as a JSON file and the calculation result is stored as a binary file in the S3 bucket (5).


#### overlap step (14,15,16)

14. This “modify inputs” step adds `{ stepName: “overlap” }` to the input and passes the newly formed object to the next step to tell the following Lambda function which calculation to set up for.
15. This step calls the setupCalculations Lambda function, which sets up parameters to run the overlap step.
16. The next step pushes the overlap task to the queue (3) which takes in parameters from the previous Lambda and the ‘integrals’ Docker image from the ECR repository. The standard output generated during the calculation is stored as a JSON file and the calculation result is stored as a binary file in the S3 bucket (5).

#### initial_guess step (17,18,19)

17. This “modify inputs” step adds `{ stepName: “initial_guess” }` to the input and passes the newly formed object to the next step to tell the following Lambda function which calculation to set up for.
18. This step calls the setupCalculations Lambda function, which sets up parameters to run the initial_guess step.
19. The next step pushes the initial_guess task into the queue (3) which takes in parameters from the previous Lambda and the ‘integrals’ Docker image from the ECR repository. The standard output generated during the calculation is stored as a JSON file and the calculation result is stored as a binary file in the S3 bucket (5).

#### two_electrons_integrals step (20)

20. This step calls the setupTei Lambda which reads the JSON file produced during the info step (9) to get the `basis_set_instance_size` of the calculation. It then uses this value to determine the calculation split ranges, hence preparing to split the calculation into `numSlices` parts. This `numSlices` value is either specified by the user using the CLI, or determined automatically by the function by estimating the memory usage of each part. The split ranges are saved in a text format in the S3 bucket. All other calculation setup tasks are also done in this step.
This function also pushes the integrals tasks in the queue (3) and waits for their completion.

#### Initialize loop variables (21)

21. A loopData dictionary is added to the inputs. This dictionary keeps track of the number of iterations as well as the difference between the `hartree_fock_energy` calculated during the last two scf_step (28) calculations.

#### Loop condition (22)

22. The loop terminates if the number of iterations have reached a specified limit (either as an input through the CLI or a default value) or the difference between the last two values of the `hartree_fock_energy` falls below a threshold value (either as an input through the CLI or a default value).

#### fock_matrix step (23,24,25)

23. This “modify inputs” step adds `{ stepName: “fock_matrix” }` to the input and passes it to the next step to tell the following Lambda function which calculation to set up for.
24. This step calls the setupCalculations Lambda function which sets up parameters to run the fock_matrix step.
25. The next step pushes the fock_matrix task in the queue (3) which takes in parameters from the previous Lambda and the ‘integrals’ Docker image from the ECR repository. The standard output generated during the calculation is stored as a JSON file and the calculation result is stored as a binary file in the S3 bucket (5).

#### scf_step (26,27,28)

26. This “modify inputs” step adds `{ stepName: “scf_step” }` to the input and passes it to the next step to tell the following Lambda function which calculation to set up for.
27. This step calls the setupCalculations Lambda function which sets up parameters to run the scf_step.
28. The next step pushes the scf_step task in the queue (3) which takes in parameters from the previous Lambda and the ‘integrals’ Docker image from the ECR repository. The scf_step is executed in this ECS container. The standard output generated during the calculation is stored as a JSON file and the calculation result is stored as a binary file in the S3 bucket (5).

#### Update loop variables (29)

29. The loopData dictionary is updated. The number of iterations is increased by 1 and a new value of `hartree_diff`, which is the difference between the last two values of the `hartree_fock_energy`, is calculated.
 
#### Success (30)

30. If either one of the conditions are met (maximum number of iterations reached or minimum value of `hartree_diff` reached), the loop terminates and the step function execution is marked as successful.
