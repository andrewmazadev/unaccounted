import json
from pathlib import Path

from models import Evidence, LogEntry, MissionState

CASE_PATH = Path(__file__).parent / "case_037.json"

CASE: dict = json.loads(CASE_PATH.read_text())

ACTIONS: dict[str, dict] = CASE["actions"]
EVIDENCE: dict[str, dict] = CASE["evidence"]

# Single in-memory mission; lost on restart (hackathon prototype).
state = MissionState()


def reset_state() -> MissionState:
    global state
    state = MissionState()
    return state


def public_case() -> dict:
    """Case data safe to show before investigation: no evidence findings.

    Each location carries its available actions (id + label) so the UI does
    not hardcode them.
    """
    case = {k: v for k, v in CASE.items() if k not in ("actions", "evidence")}
    case["locations"] = [
        {
            **loc,
            "actions": [
                {"id": action_id, "label": a["label"]}
                for action_id, a in ACTIONS.items()
                if a["location"] == loc["id"]
            ],
        }
        for loc in CASE["locations"]
    ]
    return case


def discovered_evidence() -> list[Evidence]:
    return [Evidence(**EVIDENCE[eid]) for eid in state.discovered_evidence]


def investigate(action_id: str) -> Evidence:
    """Run a known action. Raises KeyError for an unknown action.

    Idempotent: evidence and completed tasks are never duplicated. Every call
    still logs an entry so the player gets feedback.
    """
    action = ACTIONS[action_id]
    evidence = Evidence(**EVIDENCE[action["evidence_id"]])

    if evidence.id in state.discovered_evidence:
        # Repeat visit: don't re-announce as a fresh recovery.
        message = f"Records re-examined. {evidence.id} already in evidence."
    else:
        state.discovered_evidence.append(evidence.id)
        message = f"{action['log']} {evidence.id} added to evidence."

    if action_id not in state.completed_tasks:
        state.completed_tasks.append(action_id)

    state.event_log.append(LogEntry(message=message, location=action["location"]))
    return evidence
