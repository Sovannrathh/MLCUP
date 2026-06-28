#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Run from your WSL2 terminal (workbench@Sovannrath) to finish Matrix connection.
# Synapse is confirmed running at host.docker.internal:8081.
# This fixes MATRIX_HOMESERVER (was 8008, needs 8081) and starts the gateway.
set -e

echo ">>> Re-applying matrix policy (port 8081 with SSRF bypass)..."
NEMOCLAW_NON_INTERACTIVE=1 nemoclaw hermes policy-add matrix || true

echo ">>> Fixing MATRIX_HOMESERVER inside sandbox (8008 → 8081) and starting gateway..."
nemoclaw hermes connect <<'SANDBOX_EOF'
sed -i 's|MATRIX_HOMESERVER=http://host.docker.internal:8008|MATRIX_HOMESERVER=http://host.docker.internal:8081|' /sandbox/.hermes/.env
grep MATRIX_HOMESERVER /sandbox/.hermes/.env
hermes gateway
SANDBOX_EOF
