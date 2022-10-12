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
  * output_object
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
  * prefix
  * output_url
  * scf_output_url - if any (missing if first time)
* scf_step
  * xyz
  * basis_set
  * fock_output_url
  * overlap_output_url
  * core_hamiltonian_output_url
  * output_url
  * epsilon - (has reasonable default)

## Convergence

`fock_matrix` and `scf_step` run repeatedly until convergence. An `epsilon` parameter determines whether it converges or not, and this information is present in the JSON output of the `scf_step` task. There should be a global limit on the number of iterations performed (in case of slow or non-convergence).
