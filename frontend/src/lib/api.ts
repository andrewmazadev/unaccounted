// Server components use API_URL; the browser needs NEXT_PUBLIC_API_URL.
const API_URL =
  (typeof window === "undefined"
    ? process.env.API_URL
    : process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:8000";

export type LocationAction = { id: string; label: string };

export type Location = {
  id: string;
  name: string;
  functional: boolean;
  actions: LocationAction[];
};

export type LogEntry = { message: string; location: string | null };

export type MissionState = {
  discovered_evidence: string[];
  completed_tasks: string[];
  event_log: LogEntry[];
  reactor_decision: string | null;
  mission_complete: boolean;
};

export type Evidence = {
  id: string;
  name: string;
  location: string;
  reliability: string;
  finding: string;
};

export type InvestigateResult = {
  action: string;
  evidence: Evidence;
  state: MissionState;
};

export type CaseData = {
  id: string;
  vessel: string;
  vessel_type: string;
  crew_registered: number;
  initial_state: {
    primary_reactor: string;
    auxiliary_reserve_pct: number;
    core_atmosphere: string;
    life_support: string;
    living_quarters: string;
    aft_survey_bay: string;
    main_propulsion: string;
    life_signs: string;
    primary_communications: string;
    emergency_communications: string;
    lifeboats: Record<string, string>;
  };
  objectives: { id: string; text: string }[];
  locations: Location[];
  non_playable_areas: {
    id: string;
    name: string;
    branches_from: string;
    status: string;
    access: string;
  }[];
};

export async function getCase(): Promise<CaseData> {
  const res = await fetch(`${API_URL}/case`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /case failed: ${res.status}`);
  return res.json();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  if (!res.ok) {
    let detail = `${init?.method ?? "GET"} ${path} failed: ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // keep the generic message
    }
    throw new Error(detail);
  }
  return res.json();
}

export const getState = () => request<MissionState>("/state");

export const getEvidence = () => request<Evidence[]>("/evidence");

export const resetCase = () =>
  request<MissionState>("/reset", { method: "POST" });

export const investigate = (action: string) =>
  request<InvestigateResult>("/investigate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
