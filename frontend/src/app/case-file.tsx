"use client";

import { useState } from "react";
import type { CaseData, Evidence, MissionState } from "@/lib/api";
import MissionControl from "./mission-control";

const label = "font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500";

function Header({ data }: { data: CaseData }) {
  return (
    <header className="border-b border-zinc-800 pb-6">
      <p className={label}>UNACCOUNTED</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-100">
        CASE {data.id}
      </h1>
      <p className="text-2xl font-medium uppercase tracking-wide text-zinc-400">
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
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <Header data={data} />

      <section className="mt-8">
        <p className={label}>Classified briefing / Restricted distribution</p>
        <p className="mt-4 leading-7 text-zinc-300">
          {data.vessel}, an {data.vessel_type}, is adrift with{" "}
          {data.crew_registered} registered crew and no detected life signs.
          The primary reactor is {s.primary_reactor}; the vessel is running on{" "}
          {s.auxiliary_reserve_pct}% auxiliary reserve. Core atmosphere is{" "}
          {s.core_atmosphere} and life support is {s.life_support}. Living
          quarters are {s.living_quarters}; the aft survey bay is{" "}
          {s.aft_survey_bay}. Main propulsion is {s.main_propulsion}, and both
          primary and emergency communications are down. Lifeboats{" "}
          {absent.join(", ")} are absent; lifeboat {docked.join(", ")} remains
          docked.
        </p>
      </section>

      <section className="mt-8">
        <p className={label}>Mission objectives</p>
        <ol className="mt-3 border-t border-zinc-800">
          {data.objectives.map((o, i) => (
            <li
              key={o.id}
              className="flex gap-4 border-b border-zinc-900 py-3 text-zinc-200"
            >
              <span className="font-mono text-sm text-zinc-500">
                {String(i + 1).padStart(2, "0")}
              </span>
              {o.text}
            </li>
          ))}
        </ol>
      </section>

      <button
        onClick={() => setBegan(true)}
        className="mt-10 border border-zinc-600 px-6 py-3 font-mono text-sm uppercase tracking-[0.25em] text-zinc-100 transition-colors hover:border-zinc-300 hover:bg-zinc-900"
      >
        Begin investigation
      </button>
    </main>
  );
}
