# UNACCOUNTED

**Case 037: SNV Petrel**

UNACCOUNTED is an AI-agent-driven science-fiction investigation game. The player is Mission Commander of a classified investigation team boarding a silent deep-space survey vessel, and directs crew specialists in plain language to work out what happened aboard.

The core architectural principle:

> **AI interprets player intent. The deterministic game engine owns truth.**

A locally running language model converts natural-language commands into a small set of constrained investigator tasks. It does not generate evidence, decide case truth, mutate mission state, or grade the player's conclusion. Evidence and outcomes come only from deterministic game logic and canonical case data.

## The Case

The SNV Petrel is a government deep-space survey vessel found drifting after losing contact. It is still partially powered, no life signs are detected, and several lifeboats are missing.

The investigation question:

> Why was Petrel abandoned, and what happened to its crew?

Petrel suffered a real debris encounter, lost critical capabilities, and was later found abandoned. Answering the question means reconstructing the chronology, the ship's remaining capability, and the evacuation evidence.

## Current Vertical Slice

- Classified case briefing and mission objectives
- Mission Control interface with explorable investigation areas
- Deterministic investigation actions
- Four canonical evidence records (E-01, E-02, E-03, E-06)
- Natural-language multi-agent tasking (Engineering, Science, Security)
- Local AI command interpretation through Ollama
- Explicit manual controls for every investigation action
- Evidence-backed Final Incident Finding with deterministic evaluation
- Mission reset

## AI Architecture

```
Player command
      ↓
Local Qwen3 4B model through Ollama
      ↓
Structured task output
      ↓
Pydantic validation
      ↓
Server-side role/action compatibility validation
      ↓
Deterministic game engine
      ↓
Canonical evidence and mission state
```

The model is `qwen3:4b-instruct`, running through Ollama on the player's machine. No paid AI API or API key is required.

The model has one job: routing. It receives the player's command and returns structured tasks (a role, an action, and a short reason) using Ollama structured outputs. It chooses only from a bounded set of actions, and each role may perform only specific ones:

| Role | Allowed actions |
| --- | --- |
| Engineering | `inspect_reactor`, `inspect_thermal_system` |
| Science | `analyze_environmental_logs` |
| Security | `inspect_lifeboats` |

Model output is not trusted. It is validated against a Pydantic schema, and then every role/action pairing is checked against a server-side table. All tasks are validated before any is executed, so an invalid pairing is rejected before any mission-state mutation occurs. Requests the actions do not cover produce no tasks and a short message, not a substituted action.

Example command:

> Engineering, inspect the reactor while Science reconstructs the accident.

This may be interpreted as:

```
Engineering Specialist                → inspect_reactor
Science / Navigation Specialist       → analyze_environmental_logs
```

The model is a task router, not an investigator, and it has no authority beyond that.

## Deterministic Evidence

Case 037 has a fixed ground truth. Investigation actions return evidence records that are already defined in canonical case data (`backend/case_037.json`). The language model never writes evidence, so the player can form incorrect interpretations, but the evidence itself does not change based on the model.

The design principle behind the ending:

> A correct conclusion without supporting evidence is not the same as a supported finding.

The Final Incident Finding therefore requires the player to:

1. Choose a conclusion
2. Select recovered evidence
3. Submit the finding
4. Receive deterministic evaluation

The evaluation is plain server-side logic with no AI involved. The answer key never leaves the backend.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, Pydantic |
| AI | Ollama, Qwen3 4B Instruct, structured outputs |
| Data | JSON case data, in-memory mission state |
| Development | Git / GitHub |

## Local Setup

### Prerequisites

- Node.js 20.9 or newer (required by Next.js 16)
- Python 3.10 or newer
- [Ollama](https://ollama.com)
- The `qwen3:4b-instruct` model

### 1. Ollama

Start Ollama and pull the model (in a second terminal):

```bash
ollama serve
```

```bash
ollama pull qwen3:4b-instruct
```

If you use the Ollama desktop app on macOS, the server is already running and `ollama serve` is unnecessary. Alternatively, `ollama run qwen3:4b-instruct` downloads the model on first use.

The backend connects to `http://127.0.0.1:11434` and uses `qwen3:4b-instruct` by default. To override either, copy `backend/.env.example` to `backend/.env` and set `OLLAMA_HOST` or `OLLAMA_MODEL`. No `.env` file or API key is required.

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at http://localhost:8000. Run the backend from inside `backend/`, since its modules import one another directly.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs at http://localhost:3000. It talks to the backend at `http://localhost:8000` by default; set `NEXT_PUBLIC_API_URL` (browser) and `API_URL` (server-side rendering) to point elsewhere. The backend's CORS policy allows only `http://localhost:3000`.

Start the backend before loading the frontend. The page shows a connection-failure notice if the API is unreachable.

## Running the Demo

1. Open http://localhost:3000 to see Case 037.
2. Read the classified briefing and objectives.
3. Select **Begin investigation**.
4. In **Command SIG Team**, enter:

   `Engineering, inspect the reactor while Science reconstructs the accident.`

5. Observe the ENG and SCI task interpretation.
6. Evidence **E-01** and **E-03** is recovered.
7. Use the manual controls to run **Analyze heat-rejection system** and recover **E-02**.
8. Once the evidence threshold is reached, select **Open final finding**.
9. Choose the supported abandonment conclusion.
10. Cite **E-02** and **E-03**.
11. Select **Submit finding**.
12. Observe the **Finding supported** result.

The first local-model request may take several seconds while Ollama loads the model into memory. This is expected cold-start latency. Later commands are faster. **Reset case** returns the mission to its initial state.

## Design Goals

These describe the project's direction. The vertical slice demonstrates them within a single case; the broader ideas, such as consequential decisions and additional cases, are goals rather than shipped features.

- Mystery and investigation first
- AI agents as crew specialists, not omniscient narrators
- Evidence-first reasoning
- Deterministic case truth
- Consequential player decisions
- Expandable, data-driven cases
- Mature institutional sci-fi presentation

## Hackathon Scope

This repository is a focused hackathon vertical slice. It deliberately prioritizes:

- One polished investigation loop
- Constrained AI interaction
- Deterministic evidence
- Clear architecture
- Expandability

over broad feature count. Case content lives in JSON, and the interpreter's action set is asserted against the game engine's actions at startup, so the boundary between AI routing and game truth stays explicit as content grows.

Mission state is held in memory and is lost when the backend restarts. There is one case and one mission at a time.

## Repository Structure

```
unaccounted/
├── backend/
│   ├── case_037.json       # canonical case data: locations, actions, evidence, answer key
│   ├── game.py             # deterministic engine and finding evaluation
│   ├── interpreter.py      # Ollama command router and role/action validation
│   ├── main.py             # FastAPI app and endpoints
│   ├── models.py           # Pydantic models
│   ├── requirements.txt
│   └── .env.example        # optional Ollama overrides
└── frontend/
    ├── package.json
    └── src/
        ├── app/            # case briefing, Mission Control, Final Finding UI
        └── lib/api.ts      # backend API client
```
