#!/bin/bash

# Runs the CLI.
# USE: ./cli.sh --help

set -eu

exec .venv/bin/python3 -m cli $@

