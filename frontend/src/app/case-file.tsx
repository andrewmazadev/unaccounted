"use client";

import { useState } from "react";
import type { CaseData, Evidence, MissionState } from "@/lib/api";
import MissionControl from "./mission-control";
import { ClassificationBanner, Panel, label, primaryButton } from "./ui";

function Header({ data }: { data: CaseData }) {
  return (
    <header className="border-b border-zinc-800 pb-6">
      <p className={label}>Unaccounted / Mission Control</p>
      <h1 className="mt-4 font-mono text-4xl font-semibold uppercase tracking-[0.1em] text-zinc-50">
        Case {data.id}
      </h1>
      <p className="mt-1 font-mono text-xl uppercase tracking-[0.15em] text-zinc-400">
        {data.vessel}
      </p>
    </header>
  );
}

export default function CaseFile({
  data,
  initialState,
  initialEvidence,
}: {
  data: CaseData;
  initialState: MissionState;
  initialEvidence: Evidence[];
}) {
  const [began, setBegan] = useState(false);
  const s = data.initial_state;

  if (began) {
    return (
      <MissionControl
        data={data}
        initialState={initialState}
        initialEvidence={initialEvidence}
      />
    );
  }

  const lifeboats = Object.entries(s.lifeboats);
  const absent = lifeboats.filter(([, v]) => v === "absent").map(([k]) => k);
  const docked = lifeboats.filter(([, v]) => v === "docked").map(([k]) => k);

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <ClassificationBanner />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <Header data={data} />

        <Panel title="Incident briefing" className="mt-8">
          <p className="p-4 leading-7 text-zinc-200">
            {data.vessel}, an {data.vessel_type}, is adrift with{" "}
            {data.crew_registered} registered crew and no detected life signs.
            The primary reactor is {s.primary_reactor}; the vessel is running
            on {s.auxiliary_reserve_pct}% auxiliary reserve. Core atmosphere is{" "}
            {s.core_atmosphere} and life support is {s.life_support}. Living
            quarters are {s.living_quarters}; the aft survey bay is{" "}
            {s.aft_survey_bay}. Main propulsion is {s.main_propulsion}, and both
            primary and emergency communications are down. Lifeboats{" "}
            {absent.join(", ")} are absent; lifeboat {docked.join(", ")} remains
            docked.
          </p>
        </Panel>

        <Panel title="Mission objectives" className="mt-4">
          <ol className="divide-y divide-zinc-800">
            {data.objectives.map((o, i) => (
              <li key={o.id} className="flex gap-4 px-4 py-3 text-zinc-100">
                <span className="font-mono text-sm text-zinc-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {o.text}
              </li>
            ))}
          </ol>
        </Panel>

        <button
          onClick={() => setBegan(true)}
          className={`mt-8 px-6 py-3 ${primaryButton}`}
        >
          Begin investigation
        </button>
      </main>
    </div>
  );
}
