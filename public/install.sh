#!/bin/bash
# haft installer wrapper
# Fetches and runs the latest install script from GitHub

curl -fsSL https://raw.githubusercontent.com/m0n0x41d/haft/main/install.sh | bash -s -- "$@"
