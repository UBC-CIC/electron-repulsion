#!/bin/bash
# Run as ./test_scf.sh <image-name> <bucket-name>. Make sure to have the image built and environment variables set.
docker run -e "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID" -e "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY" \
$1 scf_step --basis_set sto-3g --xyz https://raw.githubusercontent.com/urysegal/xyzfiles/main/h2o.xyz \
--jobid 6762aed0-f927-4b29-a05a-d8dbd53cc3fd --bucket $2 \
--output_object scf_step_bin_files/6762aed0-f927-4b29-a05a-d8dbd53cc3fd_scf_step.bin --fock_matrix_url file://test/6762aed0-f927-4b29-a05a-d8dbd53cc3fd_fock_matrix.bin \
--hamiltonian_url file://test/6762aed0-f927-4b29-a05a-d8dbd53cc3fd_core_hamiltonian.bin \
--overlap_url file://test/6762aed0-f927-4b29-a05a-d8dbd53cc3fd_overlap.bin
