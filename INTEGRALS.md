# Working with the integrals binary

## Arguments

`integrals` contains many sub-commands. Each is invoked as `integrals SUBCOMAND ARGS` where args is a sequence of elements of the form `--flag value`. Arguments with the same name usually have a consistent meaning between sub-commands.

Common arguments:

* xyz - a url for an xyz file
* basis_set - a string representing a valid basis set
* jobid - some unique string representing the id of the job
* output_url - generally, a url for a single output file

Sub-commands and their arguments:

* info
  * xyz
  * basis_set
* two_electron_integrals
  * xyz
  * basis_set
  * jobid
  * bucket
  * output_object - `.bin` file
  * begin
  * end
* core_hamiltonian, overlap, and initial_guess
  * jobid
  * xyz
  * basis_set
  * bucket
  * output_object
* fock_matrix
  * xyz
  * basis_set
  * bucket
  * eri_prefix - This is the `output_object` of the `two_electron_integrals` step.
  * output_url
  * density_url - Density matrices are created by the initial-guess AND the scf-step. So first time, pass the initial-guess output URL. From then on pass the latest scf-step output.
* scf_step
  * xyz
  * basis_set
  * fock_output_url
  * overlap_output_url
  * core_hamiltonian_output_url
  * output_url
  * epsilon - (has reasonable default)

## Example

    ./integrals fock_matrix --jobid testjob --xyz https://raw.githubusercontent.com/urysegal/xyzfiles/main/h2o.xyz --basis_set sto-3g --bucket two-electrons-integrals.webqc --output_url s3://path/to/output.bin --density_url s3://path/to/density.bin --eri_prefix testjob

## Convergence

`fock_matrix` and `scf_step` run repeatedly until convergence. An `epsilon` parameter determines whether it converges or not, and this information is present in the JSON output of the `scf_step` task. There should be a global limit on the number of iterations performed (in case of slow or non-convergence).
