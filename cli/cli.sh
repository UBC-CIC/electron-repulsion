#!/bin/bash

set -eu

exec cli/.venv/bin/python cli.py $@

