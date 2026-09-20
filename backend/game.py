import json
from pathlib import Path

from models import Evidence, LogEntry, MissionState, OutcomeLine, ReportResult

CASE_PATH = Path(__file__).parent / "case_037.json"

CASE: dict = json.loads(CASE_PATH.read_text())

ACTIONS: dict[str, dict] = CASE["actions"]
EVIDENCE: dict[str, dict] = CASE["evidence"]

# Answer key for the final finding. Never sent to the client (see public_case).
FINAL_FINDING: dict = CASE["final_finding"]
FINDINGS: dict[str, dict] = FINAL_FINDING["findings"]

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
    case = {
        k: v
        for k, v in CASE.items()
        if k not in ("actions", "evidence", "final_finding")
    }
    # Choices only: no correctness flags, required evidence or unlock rules.
    case["final_finding"] = {
        "question": FINAL_FINDING["question"],
        "choices": [
            {"id": fid, "text": f["choice_text"]} for fid, f in FINDINGS.items()
        ],
    }
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
    state.report_available = all(
        eid in state.discovered_evidence for eid in FINAL_FINDING["unlock_evidence"]
    )
    return evidence


class ReportError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


def submit_report(finding_id: str, evidence_ids: list[str]) -> ReportResult:
    """Evaluate a final finding deterministically against recovered evidence.

    Raises ReportError for requests that are invalid or not allowed in the
    current mission state; those leave the mission unchanged. Evaluated
    attempts (supported or not) are logged.
    """
    finding = FINDINGS.get(finding_id)
    if finding is None:
        raise ReportError(
            400,
            f"Unknown finding '{finding_id}'. Valid findings: {', '.join(FINDINGS)}",
        )

    submitted = list(dict.fromkeys(evidence_ids))  # de-duplicate, keep order
    unknown = [e for e in submitted if e not in EVIDENCE]
    if unknown:
        raise ReportError(400, f"Unknown evidence: {', '.join(unknown)}.")
    unrecovered = [e for e in submitted if e not in state.discovered_evidence]
    if unrecovered:
        raise ReportError(
            400, f"Evidence not recovered: {', '.join(unrecovered)}."
        )

    if state.mission_complete:
        raise ReportError(409, "A final finding has already been established.")
    if not state.report_available:
        raise ReportError(
            409, "Insufficient evidence to submit an incident finding."
        )

    if not finding["canonical"]:
        supported, missing = False, []
        message = finding["unsupported_message"]
    else:
        missing = [e for e in finding["required_evidence"] if e not in submitted]
        supported = not missing
        message = (
            finding["supported_message"]
            if supported
            else finding["insufficient_message"]
        )

    result = ReportResult(
        finding_id=finding_id,
        supported=supported,
        submitted_evidence=submitted,
        missing_evidence=missing,
        message=message,
        outcome=[
            OutcomeLine(
                label=line["label"].format(**CASE).upper(),
                value=line["value"].upper(),
            )
            for line in FINAL_FINDING["outcome"]
        ]
        if supported
        else [],
    )
    state.event_log.append(
        LogEntry(
            message="Primary abandonment finding supported."
            if supported
            else "Submitted finding lacked evidentiary support.",
            location="final_report",
        )
    )
    if supported:
        state.final_report = result
        state.mission_complete = True
    return result
