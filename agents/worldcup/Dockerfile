# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# WorldCup sandbox image — WorldCup Agent + NemoClaw plugin inside OpenShell
#
# Layers PR-specific code (plugin, config, startup script) on top of the
# pre-built WorldCup base image. Mirrors the Hermes Dockerfile structure.

ARG BASE_IMAGE=ghcr.io/nvidia/nemoclaw/worldcup-sandbox-base:latest

# hadolint ignore=DL3006
FROM ${BASE_IMAGE}

# Keep the final image contract explicit even when the published base image
# changes independently of this Dockerfile.
RUN set -eu; \
    worldcup_path="$(command -v worldcup 2>/dev/null || true)"; \
    if [ "$worldcup_path" != "/usr/local/bin/worldcup" ]; then \
        echo "ERROR: expected worldcup at /usr/local/bin/worldcup, got ${worldcup_path:-missing}" >&2; \
        exit 1; \
    fi; \
    test -x /usr/local/bin/worldcup; \
    /usr/local/bin/worldcup --version

# Install libolm for Matrix E2EE support via mautrix-python.
# libolm-dev is only needed to compile python-olm; remove it after pip install
# to keep it out of the final image layer.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libolm3 libolm-dev cmake make gcc g++ python3-dev \
    && uv pip install --python /opt/worldcup/.venv/bin/python --no-cache "mautrix[encryption]" \
    && apt-get remove --purge -y libolm-dev cmake make gcc g++ python3-dev \
    && apt-get autoremove --purge -y \
    && rm -rf /var/lib/apt/lists/*

# Harden: remove unnecessary build tools and network probes
RUN (apt-get remove --purge -y gcc gcc-12 g++ g++-12 cpp cpp-12 make \
        netcat-openbsd netcat-traditional ncat 2>/dev/null || true) \
    && apt-get autoremove --purge -y \
    && rm -rf /var/lib/apt/lists/*

# Symlink certifi's CA bundle at SSL_CERT_FILE so WorldCup TLS trusts the
# OpenShell L7 proxy CA. Done at image build (as root) because at runtime
# root doesn't see SSL_CERT_FILE and the gateway user can't write the venv.
ARG SSL_CERT_FILE=/etc/openshell-tls/ca-bundle.pem
# hadolint ignore=DL3059
RUN _worldcup_certifi=$(/opt/worldcup/.venv/bin/python -c 'import certifi; print(certifi.where())') \
    && ln -sf "$SSL_CERT_FILE" "$_worldcup_certifi"

ENV WORLDCUP_WEB_DIST="/opt/worldcup/worldcup_cli/web_dist"

# Copy NemoClaw plugin for WorldCup (Python-based)
COPY agents/worldcup/plugin/ /opt/nemoclaw-worldcup-plugin/
RUN chmod -R a+rX /opt/nemoclaw-worldcup-plugin/

# Copy config generator
COPY agents/worldcup/generate-config.ts /opt/nemoclaw-worldcup-config/generate-config.ts
COPY agents/worldcup/config/ /opt/nemoclaw-worldcup-config/config/
COPY agents/worldcup/host/managed-tool-gateway-matrix.json /opt/nemoclaw-worldcup-config/managed-tool-gateway-matrix.json
RUN find /opt/nemoclaw-worldcup-config -type d -exec chmod 755 {} + \
    && find /opt/nemoclaw-worldcup-config -type f -exec chmod 444 {} +

# Copy blueprint (shared infrastructure)
COPY nemoclaw-blueprint/ /opt/nemoclaw-blueprint/
RUN chmod -R a+rX /opt/nemoclaw-blueprint/

# Copy startup script and the secret-boundary validator.
COPY scripts/lib/sandbox-init.sh /usr/local/lib/nemoclaw/sandbox-init.sh
COPY agents/worldcup/start.sh /usr/local/bin/nemoclaw-start
COPY agents/worldcup/validate-env-secret-boundary.py /usr/local/lib/nemoclaw/validate-worldcup-env-secret-boundary.py
RUN chmod 755 /usr/local/bin/nemoclaw-start /usr/local/lib/nemoclaw/sandbox-init.sh /usr/local/lib/nemoclaw/validate-worldcup-env-secret-boundary.py

# Wrap the worldcup CLI so the runtime env secret boundary is enforced for
# `worldcup gateway` no matter how it is invoked.
COPY agents/worldcup/worldcup-wrapper.sh /usr/local/lib/nemoclaw/worldcup-wrapper.sh
RUN mv /usr/local/bin/worldcup /usr/local/bin/worldcup.real \
    && install -m 0755 /usr/local/lib/nemoclaw/worldcup-wrapper.sh /usr/local/bin/worldcup \
    && chmod 755 /usr/local/bin/worldcup.real \
    && /usr/local/bin/worldcup --version

# Build args for config that varies per deployment.
ARG NEMOCLAW_MODEL=nvidia/nemotron-3-super-120b-a12b
ARG NEMOCLAW_PROVIDER_KEY=custom
ARG NEMOCLAW_UPSTREAM_PROVIDER=custom
ARG NEMOCLAW_INFERENCE_BASE_URL=https://inference.local/v1
ARG NEMOCLAW_INFERENCE_API=openai-completions
ARG CHAT_UI_URL=http://127.0.0.1:18790
ARG NEMOCLAW_BUILD_ID=default
ARG NEMOCLAW_DARWIN_VM_COMPAT=0

# Promote build-args to env vars for the config generation script.
ENV NEMOCLAW_MODEL=${NEMOCLAW_MODEL} \
    NEMOCLAW_PROVIDER_KEY=${NEMOCLAW_PROVIDER_KEY} \
    NEMOCLAW_UPSTREAM_PROVIDER=${NEMOCLAW_UPSTREAM_PROVIDER} \
    NEMOCLAW_INFERENCE_BASE_URL=${NEMOCLAW_INFERENCE_BASE_URL} \
    NEMOCLAW_INFERENCE_API=${NEMOCLAW_INFERENCE_API} \
    CHAT_UI_URL=${CHAT_UI_URL}

WORKDIR /sandbox
USER sandbox

# Set up blueprint for local resolution
RUN mkdir -p /sandbox/.nemoclaw/blueprints/0.1.0 \
    && cp -r /opt/nemoclaw-blueprint/* /sandbox/.nemoclaw/blueprints/0.1.0/

# Generate WorldCup config.yaml and .env from build args.
RUN node --experimental-strip-types /opt/nemoclaw-worldcup-config/generate-config.ts

# Install NemoClaw plugin into WorldCup
# hadolint ignore=DL3059
RUN mkdir -p /sandbox/.worldcup/plugins/nemoclaw \
    && cp -r /opt/nemoclaw-worldcup-plugin/* /sandbox/.worldcup/plugins/nemoclaw/

# Set mutable-default permissions (640 files, 3770 config root).
# hadolint ignore=DL3002
USER root
RUN set -eu; \
    config_dir=/sandbox/.worldcup; \
    mkdir -p \
        "$config_dir/memories" \
        "$config_dir/sessions" \
        "$config_dir/skills" \
        "$config_dir/plugins" \
        "$config_dir/cron" \
        "$config_dir/logs" \
        "$config_dir/skins" \
        "$config_dir/plans" \
        "$config_dir/workspace" \
        "$config_dir/profiles" \
        "$config_dir/cache" \
        "$config_dir/pairing" \
        "$config_dir/runtime"; \
    rm -rf /root/.cache/pip /sandbox/.cache \
    && chown -R sandbox:sandbox /sandbox/.worldcup \
    && chown gateway:sandbox /sandbox/.worldcup/runtime \
    && chmod 3770 /sandbox/.worldcup \
    && chmod 770 \
        /sandbox/.worldcup/memories \
        /sandbox/.worldcup/sessions \
        /sandbox/.worldcup/skills \
        /sandbox/.worldcup/plugins \
        /sandbox/.worldcup/cron \
        /sandbox/.worldcup/logs \
        /sandbox/.worldcup/skins \
        /sandbox/.worldcup/plans \
        /sandbox/.worldcup/workspace \
        /sandbox/.worldcup/profiles \
        /sandbox/.worldcup/cache \
        /sandbox/.worldcup/pairing \
        /sandbox/.worldcup/runtime \
    && chmod 2770 /sandbox/.worldcup/runtime \
    && chmod 640 /sandbox/.worldcup/config.yaml \
    && chmod 640 /sandbox/.worldcup/.env \
    && for name in state.db state.db-wal state.db-shm gateway.lock gateway_state.json channel_directory.json; do \
        rm -f "/sandbox/.worldcup/${name}"; \
        ln -s "runtime/${name}" "/sandbox/.worldcup/${name}"; \
    done \
    && : > /sandbox/.worldcup/.worldcup_history \
    && chown sandbox:sandbox /sandbox/.worldcup/.worldcup_history \
    && chmod 660 /sandbox/.worldcup/.worldcup_history

# Pin config hash at build time for integrity verification at startup.
RUN mkdir -p /etc/nemoclaw \
    && sha256sum /sandbox/.worldcup/config.yaml /sandbox/.worldcup/.env \
    > /etc/nemoclaw/worldcup.config-hash \
    && chown root:root /etc/nemoclaw/worldcup.config-hash \
    && chmod 444 /etc/nemoclaw/worldcup.config-hash

# Backward-compatible marker for host-side shields logic on older sandboxes.
RUN sha256sum /sandbox/.worldcup/config.yaml /sandbox/.worldcup/.env \
    > /sandbox/.worldcup/.config-hash \
    && chmod 600 /sandbox/.worldcup/.config-hash \
    && chown sandbox:sandbox /sandbox/.worldcup/.config-hash

RUN if [ "$NEMOCLAW_DARWIN_VM_COMPAT" = "1" ]; then \
        chmod -R a+rwX /sandbox/.worldcup; \
        find /sandbox/.worldcup -type d -exec chmod a+rwx {} +; \
        chmod a+rw /sandbox/.bashrc /sandbox/.profile; \
    fi

ENTRYPOINT ["/usr/local/bin/nemoclaw-start"]
CMD ["/bin/bash"]
