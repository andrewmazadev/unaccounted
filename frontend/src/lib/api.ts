const API_URL = process.env.API_URL ?? "http://localhost:8000";

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
  locations: { id: string; name: string; functional: boolean }[];
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
