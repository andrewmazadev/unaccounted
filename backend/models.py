from pydantic import BaseModel, Field


class LogEntry(BaseModel):
    message: str
    location: str | None = None


class MissionState(BaseModel):
    discovered_evidence: list[str] = Field(default_factory=list)
    completed_tasks: list[str] = Field(default_factory=list)
    event_log: list[LogEntry] = Field(default_factory=list)
    reactor_decision: str | None = None
    mission_complete: bool = False


class Evidence(BaseModel):
    id: str
    name: str
    location: str
    reliability: str
    finding: str


class InvestigateRequest(BaseModel):
    action: str


class InvestigateResponse(BaseModel):
    action: str
    evidence: Evidence
    state: MissionState
