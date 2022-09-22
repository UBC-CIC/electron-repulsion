#!/bin/bash

# Runs the CLI.
# USE: ./cli.sh --help

set -eu

cd "$(dirname $0)"

exec .venv/bin/python3 -m cli.main $@
