#!/bin/bash
# Start the production server in the background
nohup python3 run_onVM.py > server.log 2>&1 &
echo "Server started in the background. Logs are being written to server.log"
