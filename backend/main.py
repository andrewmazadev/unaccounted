from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import game
from models import Evidence, InvestigateRequest, InvestigateResponse, MissionState

app = FastAPI(title="Unaccounted API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
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


@app.post("/reset", response_model=MissionState)
def reset():
    return game.reset_state()
