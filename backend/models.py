from pydantic import BaseModel, Field

from interpreter import InterpretedTask


class LogEntry(BaseModel):
    message: str
    location: str | None = None


class OutcomeLine(BaseModel):
    label: str
    value: str


class ReportResult(BaseModel):
    finding_id: str
    supported: bool
    submitted_evidence: list[str]
    missing_evidence: list[str]
    message: str
    # Only populated for a supported finding.
    outcome: list[OutcomeLine] = Field(default_factory=list)


class MissionState(BaseModel):
    discovered_evidence: list[str] = Field(default_factory=list)
    completed_tasks: list[str] = Field(default_factory=list)
    event_log: list[LogEntry] = Field(default_factory=list)
    reactor_decision: str | None = None
    # True once enough evidence is recovered to submit a final finding.
    report_available: bool = False
    # The accepted final finding, if any.
    final_report: ReportResult | None = None
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


class CommandRequest(BaseModel):
    command: str = Field(min_length=1, max_length=500)


class CommandResponse(BaseModel):
    command: str
    tasks: list[InterpretedTask]
    message: str | None
    evidence: list[Evidence]
    state: MissionState


class ReportRequest(BaseModel):
    finding_id: str
    evidence_ids: list[str] = Field(default_factory=list, max_length=20)


class ReportResponse(ReportResult):
    state: MissionState
