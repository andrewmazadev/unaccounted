from typing import get_args

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import game
import interpreter
from models import (
    CommandRequest,
    CommandResponse,
    Evidence,
    InvestigateRequest,
    InvestigateResponse,
    MissionState,
    ReportRequest,
    ReportResponse,
)

# The interpreter's action enum must stay in lockstep with the game's actions.
assert set(get_args(interpreter.Action)) == set(game.ACTIONS)
assert set().union(*interpreter.ROLE_ACTIONS.values()) == set(game.ACTIONS)

app = FastAPI(title="Unaccounted API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "UNACCOUNTED systems online"}


@app.get("/health")
def health():
    return {"status": "operational"}


@app.get("/case")
def get_case():
    return game.public_case()


@app.get("/state", response_model=MissionState)
def get_state():
    return game.state


@app.get("/evidence", response_model=list[Evidence])
def get_evidence():
    """Full records for evidence discovered so far (state only holds IDs)."""
    return game.discovered_evidence()


@app.post("/investigate", response_model=InvestigateResponse)
def investigate(req: InvestigateRequest):
    if req.action not in game.ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown action '{req.action}'. "
            f"Valid actions: {', '.join(game.ACTIONS)}",
        )
    evidence = game.investigate(req.action)
    return InvestigateResponse(
        action=req.action, evidence=evidence, state=game.state
    )


@app.post("/command", response_model=CommandResponse)
def command(req: CommandRequest):
    """Interpret a natural-language command, then run the resulting tasks.

    The model only picks from the allowed actions; evidence and state changes
    come exclusively from game.investigate().
    """
    text = req.command.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Command is empty.")

    # Interpretation happens first and never touches state, so any failure
    # here leaves the mission unchanged.
    try:
        interpretation = interpreter.interpret(text)
    except interpreter.InterpreterError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    # Validate every role/action pairing and action before executing any
    # task, so an invalid one leaves the mission completely unchanged.
    try:
        interpreter.validate_tasks(interpretation.tasks)
    except interpreter.InterpreterError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    tasks, seen = [], set()
    for t in interpretation.tasks:
        if t.action not in seen:
            seen.add(t.action)
            tasks.append(t)
    if any(t.action not in game.ACTIONS for t in tasks):
        raise HTTPException(
            status_code=502,
            detail="Command could not be interpreted. Please rephrase and retry.",
        )

    evidence = [game.investigate(t.action) for t in tasks]
    return CommandResponse(
        command=text,
        tasks=tasks,
        message=interpretation.message,
        evidence=evidence,
        state=game.state,
    )


@app.post("/report", response_model=ReportResponse)
def report(req: ReportRequest):
    """Submit the final incident finding. Deterministic; no AI involved."""
    try:
        result = game.submit_report(req.finding_id, req.evidence_ids)
    except game.ReportError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    return ReportResponse(**result.model_dump(), state=game.state)


@app.post("/reset", response_model=MissionState)
def reset():
    return game.reset_state()
