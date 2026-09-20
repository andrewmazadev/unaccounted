import json
from pathlib import Path

from models import MissionState

CASE_PATH = Path(__file__).parent / "case_037.json"

CASE: dict = json.loads(CASE_PATH.read_text())

# Single in-memory mission; lost on restart (hackathon prototype).
state = MissionState()


def reset_state() -> MissionState:
    global state
    state = MissionState()
    return state
