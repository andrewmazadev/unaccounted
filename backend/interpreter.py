"""Natural-language command router.

The model only maps player intent onto the fixed roles/actions below. It is
not the investigator and not the source of truth: everything it returns is
re-validated here and executed by the deterministic engine (game.investigate).
"""

import logging
import os
from pathlib import Path
from typing import Literal

import ollama
from dotenv import load_dotenv
from pydantic import BaseModel, ValidationError, field_validator

load_dotenv(Path(__file__).parent / ".env")

logger = logging.getLogger(__name__)

DEFAULT_HOST = "http://127.0.0.1:11434"
DEFAULT_MODEL = "qwen3:4b-instruct"
REQUEST_TIMEOUT = 60.0  # seconds; the first call may load the model
MAX_TASKS = 3

Role = Literal["engineering", "science", "security"]
Action = Literal[
    "inspect_reactor",
    "inspect_thermal_system",
    "analyze_environmental_logs",
    "inspect_lifeboats",
]


# Server-side source of truth for which role may perform which action. The
# prompt describes this too, but it is enforced by validate_tasks().
ROLE_ACTIONS: dict[str, frozenset[str]] = {
    "engineering": frozenset({"inspect_reactor", "inspect_thermal_system"}),
    "science": frozenset({"analyze_environmental_logs"}),
    "security": frozenset({"inspect_lifeboats"}),
}


class InterpretedTask(BaseModel):
    role: Role
    action: Action
    reason: str


class Interpretation(BaseModel):
    """Strict schema for the model response (Ollama structured output)."""

    tasks: list[InterpretedTask]
    message: str | None

    # Enforced here as well as by the prompt; the model is not trusted.
    @field_validator("tasks")
    @classmethod
    def _limit_tasks(cls, tasks: list[InterpretedTask]):
        if len(tasks) > MAX_TASKS:
            raise ValueError(f"at most {MAX_TASKS} tasks allowed")
        return tasks


class InterpreterError(Exception):
    """Recoverable failure. `detail` is safe to show the player."""

    def __init__(self, detail: str, status_code: int):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


INSTRUCTIONS = f"""\
You are an intent router for a spaceship investigation game. You are not the \
investigator and not the source of truth. You never decide what is found, \
what evidence says, or what happens. You only translate the player's command \
into tasks from the fixed lists below; a deterministic game engine runs them.

Investigator roles (role value: capabilities):
- engineering: Engineering Specialist. Reactor, thermal systems, propulsion, power.
- science: Science / Navigation Specialist. Environmental records, sensor data, \
debris analysis, navigation chronology.
- security: Security / Operations Specialist. Physical inspection, access, \
manifests, lifeboat systems.

Allowed actions (action value: description):
- inspect_reactor: Engineering inspection of reactor shutdown/SCRAM records.
- inspect_thermal_system: Engineering analysis of heat-rejection and thermal-system damage.
- analyze_environmental_logs: Science/navigation analysis of debris, sensor, \
environmental and incident chronology records.
- inspect_lifeboats: Security/operations inspection of lifeboat manifests and launch telemetry.

Rules:
- Return between 0 and {MAX_TASKS} tasks. Never repeat an action.
- Pick the action that best matches the command's intent; the command may name \
a role, a system, or just a goal (e.g. "why was the reactor shut down").
- "role" is the specialist best suited to the chosen action.
- "reason" is one short sentence restating the task's purpose.
- If the command asks for something no allowed action covers (e.g. medical \
examination, crew records, opening sealed areas, deciding the reactor outcome), \
return no tasks for that part and never substitute a different action. If \
nothing can be done, set "message" to one short sentence saying the request \
is unavailable in this demo. Otherwise set "message" to null, or briefly note \
any part that was skipped.
- Do not invent findings, evidence, or results. Do not answer the question yourself.
"""


def validate_tasks(tasks: list[InterpretedTask]) -> None:
    """Check every task's role/action pairing. Pure: touches no game state.

    Callers must run this over ALL tasks before executing ANY of them.
    """
    for task in tasks:
        if task.action not in ROLE_ACTIONS.get(task.role, frozenset()):
            logger.warning(
                "Rejected invalid role/action pairing: %s + %s",
                task.role,
                task.action,
            )
            raise InterpreterError(
                "Command could not be interpreted. Please rephrase and retry.",
                502,
            )


def _host() -> str:
    return (os.environ.get("OLLAMA_HOST") or "").strip() or DEFAULT_HOST


def _model() -> str:
    return (os.environ.get("OLLAMA_MODEL") or "").strip() or DEFAULT_MODEL


_UNAVAILABLE = "Natural-language command interface unavailable."


def interpret(command: str, client: ollama.Client | None = None) -> Interpretation:
    """Turn a player command into validated tasks. Never touches game state.

    Each call is independent (no history). `client` is injectable for tests.
    Raises InterpreterError with a player-safe message on any failure.
    """
    model = _model()
    if client is None:
        client = ollama.Client(host=_host(), timeout=REQUEST_TIMEOUT)

    try:
        response = client.chat(
            model=model,
            messages=[
                {"role": "system", "content": INSTRUCTIONS},
                {"role": "user", "content": command},
            ],
            format=Interpretation.model_json_schema(),
            options={"temperature": 0},
        )
        return Interpretation.model_validate_json(response.message.content or "")
    except ValidationError:
        logger.warning("Interpreter response failed schema validation")
        raise InterpreterError(
            "Command could not be interpreted. Please rephrase and retry.", 502
        ) from None
    except ollama.ResponseError as exc:
        logger.warning("Ollama error (status %s)", exc.status_code)
        if exc.status_code == 404:
            raise InterpreterError(
                f"{_UNAVAILABLE} Local model is not installed.", 503
            ) from None
        raise InterpreterError(
            "Command interpretation is temporarily unavailable. Please retry.",
            502,
        ) from None
    except (ConnectionError, OSError):
        logger.warning("Ollama server is not reachable at %s", _host())
        raise InterpreterError(
            f"{_UNAVAILABLE} Local model is not running.", 503
        ) from None
    except Exception as exc:
        logger.warning("Interpreter request failed: %s", type(exc).__name__)
        raise InterpreterError(
            "Command interpretation is temporarily unavailable. Please retry.",
            502,
        ) from None
