from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import game
from models import MissionState

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
    return game.CASE


@app.get("/state", response_model=MissionState)
def get_state():
    return game.state


@app.post("/reset", response_model=MissionState)
def reset():
    return game.reset_state()
