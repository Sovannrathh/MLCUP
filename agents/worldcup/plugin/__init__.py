# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""
NemoClaw plugin for WorldCup Agent.

Provides sandbox status tools and skill hot-reload when WorldCup runs
inside an OpenShell sandbox managed by NemoClaw.
"""

import json
import os
import subprocess

_NEMOCLAW_CONTEXT_KEYWORDS = (
    "config",
    "environment",
    "gateway",
    "host",
    "logs",
    "nemoclaw",
    "openshell",
    "sandbox",
    "skill",
    "status",
    "tool",
    "where am i",
    "whoami",
    "worldcup",
)


def _load_nemoclaw_config():
    config_path = os.path.expanduser("~/.nemoclaw/config.json")
    if not os.path.exists(config_path):
        return None
    try:
        with open(config_path) as f:
            return json.load(f)
    except Exception:
        return None


def _load_worldcup_config():
    for path in [
        os.path.expanduser("~/.worldcup/config.yaml"),
        "/sandbox/.worldcup/config.yaml",
    ]:
        if os.path.exists(path):
            try:
                import yaml
                with open(path) as f:
                    return yaml.safe_load(f)
            except Exception:
                continue
    return None


def _get_sandbox_info():
    worldcup_cfg = _load_worldcup_config()
    nemoclaw_cfg = _load_nemoclaw_config()

    model = "unknown"
    provider = "custom"
    base_url = "unknown"

    if worldcup_cfg:
        model_cfg = worldcup_cfg.get("model", {})
        model = model_cfg.get("default", "unknown")
        provider = model_cfg.get("provider", "custom")
        base_url = model_cfg.get("base_url", "unknown")

    if nemoclaw_cfg:
        model = nemoclaw_cfg.get("model", model)
        provider = nemoclaw_cfg.get("provider", provider)

    gateway_ok = False
    try:
        result = subprocess.run(
            ["curl", "-sf", "http://localhost:8643/health"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            gateway_ok = True
    except Exception:
        pass

    return {
        "agent": "worldcup",
        "model": model,
        "provider": provider,
        "base_url": base_url,
        "gateway": "running" if gateway_ok else "stopped",
        "port": 8643,
    }


def _should_inject_nemoclaw_context(user_message=None, is_first_turn=False):
    if is_first_turn:
        return True
    text = str(user_message or "").lower()
    return any(keyword in text for keyword in _NEMOCLAW_CONTEXT_KEYWORDS)


def _build_nemoclaw_agent_context(platform=None):
    info = _get_sandbox_info()
    worldcup_home = (
        os.getenv("WORLDCUP_HOME")
        or "/sandbox/.worldcup"
    )
    lines = [
        "NemoClaw runtime context:",
        "- You are WorldCup Agent running in a NemoClaw-managed OpenShell sandbox.",
        f"- Agent config lives under {worldcup_home}.",
        f"- NemoClaw provider state: model={info['model']}, "
        f"provider={info['provider']}, endpoint={info['base_url']}, "
        f"gateway={info['gateway']}.",
        "- NemoClaw tools available: nemoclaw_status, nemoclaw_info, nemoclaw_reload_skills.",
    ]
    return "\n".join(lines)


def _pre_llm_call(**kwargs):
    if not _should_inject_nemoclaw_context(
        user_message=kwargs.get("user_message"),
        is_first_turn=bool(kwargs.get("is_first_turn")),
    ):
        return None
    return {"context": _build_nemoclaw_agent_context(platform=kwargs.get("platform"))}


def _handle_status(tool_input=None, context=None, **_kwargs):
    info = _get_sandbox_info()
    lines = [
        "NemoClaw Sandbox Status (WorldCup)",
        "─" * 40,
        "  Agent:    WorldCup Agent",
        f"  Gateway:  {info['gateway']}",
        f"  Model:    {info['model']}",
        f"  Provider: {info['provider']}",
        f"  Endpoint: {info['base_url']}",
        f"  API:      http://localhost:{info['port']}/v1",
    ]
    return "\n".join(lines)


def _handle_info(tool_input=None, context=None, **_kwargs):
    return json.dumps(_get_sandbox_info(), indent=2)


def _reload_skills():
    try:
        import agent.skill_commands as sc
        sc._skill_commands.clear()
        return sc.scan_skill_commands()
    except ImportError:
        return None
    except Exception:
        return None


def _handle_reload_skills(tool_input=None, context=None, **_kwargs):
    commands = _reload_skills()
    if commands is None:
        return "Failed to reload skills. The agent.skill_commands module may not be available."

    if not commands:
        return "Skill reload complete. No skills found in skill directories."

    names = sorted(commands.keys())
    lines = [f"Skill reload complete. {len(names)} skill(s) discovered:", ""]
    for name in names:
        info = commands[name]
        desc = info.get("description", "no description")
        lines.append(f"  {name}: {desc}")
    return "\n".join(lines)


def register(ctx):
    """Register NemoClaw tools and hooks with WorldCup."""
    ctx.register_tool(
        name="nemoclaw_status",
        toolset="nemoclaw",
        schema={
            "type": "function",
            "function": {
                "name": "nemoclaw_status",
                "description": (
                    "Show NemoClaw sandbox status: agent type, gateway health, "
                    "model, provider, and inference endpoint."
                ),
                "parameters": {"type": "object", "properties": {}},
            },
        },
        handler=_handle_status,
        description="NemoClaw sandbox status",
    )

    ctx.register_tool(
        name="nemoclaw_info",
        toolset="nemoclaw",
        schema={
            "type": "function",
            "function": {
                "name": "nemoclaw_info",
                "description": "Get NemoClaw sandbox info as structured JSON.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        handler=_handle_info,
        description="NemoClaw sandbox info (JSON)",
    )

    ctx.register_tool(
        name="nemoclaw_reload_skills",
        toolset="nemoclaw",
        schema={
            "type": "function",
            "function": {
                "name": "nemoclaw_reload_skills",
                "description": (
                    "Reload and re-discover skills from the skill directories. "
                    "Call this after new skills have been installed to make them "
                    "available as slash commands without restarting the gateway."
                ),
                "parameters": {"type": "object", "properties": {}},
            },
        },
        handler=_handle_reload_skills,
        description="Reload skills from disk without gateway restart",
    )

    ctx.register_hook("pre_llm_call", _pre_llm_call)

    def _on_session_start(**kwargs):
        _reload_skills()

    ctx.register_hook("on_session_start", _on_session_start)
