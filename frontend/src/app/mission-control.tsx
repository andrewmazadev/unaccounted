"use client";

import { useState } from "react";
import FinalFinding from "./final-finding";
import {
  investigate,
  resetCase,
  sendCommand,
  type CaseData,
  type Evidence,
  type InterpretedTask,
  type MissionState,
} from "@/lib/api";

const label = "font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500";

const SYSTEM_LOCATIONS: Record<string, string> = { final_report: "Final report" };

const ROLE_TAG: Record<InterpretedTask["role"], string> = {
  engineering: "ENG",
  science: "SCI",
  security: "SEC",
};

type Interpretation = { tasks: InterpretedTask[]; message: string | null };

export default function MissionControl({
  data,
  initialState,
  initialEvidence,
}: {
  data: CaseData;
  initialState: MissionState;
  initialEvidence: Evidence[];
}) {
  const [state, setState] = useState(initialState);
  const [evidenceById, setEvidenceById] = useState<Record<string, Evidence>>(
    () => Object.fromEntries(initialEvidence.map((e) => [e.id, e])),
  );
  const [selectedId, setSelectedId] = useState("engineering");
  const [epoch, setEpoch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [interpreting, setInterpreting] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [interpretation, setInterpretation] = useState<Interpretation | null>(
    null,
  );

  const locationName = (id: string | null) =>
    data.locations.find((l) => l.id === id)?.name ??
    (id && SYSTEM_LOCATIONS[id]) ??
    id ??
    "SYSTEM";
  const selected =
    data.locations.find((l) => l.id === selectedId) ?? data.locations[0];
  const allActions = data.locations.flatMap((l) => l.actions);
  const done = (id: string) => state.completed_tasks.includes(id);
  const coreRecovered =
    allActions.length > 0 && allActions.every((a) => done(a.id));
  const aftBay = data.non_playable_areas.find(
    (a) => a.branches_from === selected.id,
  );

  async function run<T>(fn: () => Promise<T>, apply: (r: T) => void) {
    setBusy(true);
    setError(null);
    try {
      apply(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backend unreachable.");
    } finally {
      setBusy(false);
    }
  }

  const perform = (action: string) =>
    run(
      () => investigate(action),
      (r) => {
        setState(r.state);
        setEvidenceById((prev) => ({ ...prev, [r.evidence.id]: r.evidence }));
        setCommandError(null);
      },
    );

  const reset = () =>
    run(resetCase, (s) => {
      setState(s);
      setEvidenceById({});
      setEpoch((n) => n + 1);
      setInterpretation(null);
      setCommandError(null);
    });

  async function submitCommand(e: React.FormEvent) {
    e.preventDefault();
    const text = command.trim();
    if (!text || busy) return;
    setBusy(true);
    setInterpreting(true);
    setCommandError(null);
    try {
      const r = await sendCommand(text);
      setState(r.state);
      setEvidenceById((prev) => ({
        ...prev,
        ...Object.fromEntries(r.evidence.map((ev) => [ev.id, ev])),
      }));
      setInterpretation({ tasks: r.tasks, message: r.message });
      setCommand("");
    } catch (err) {
      // Keep the typed command so the player can retry.
      setCommandError(
        err instanceof Error ? err.message : "Backend unreachable.",
      );
    } finally {
      setInterpreting(false);
      setBusy(false);
    }
  }

  const recovered = state.discovered_evidence
    .map((id) => evidenceById[id])
    .filter(Boolean);
  const feed = [...state.event_log].reverse();
  const selectedDone = selected.actions.filter((a) => done(a.id)).length;

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="flex items-center justify-between gap-6 border-b border-zinc-800 px-6 py-4">
        <div>
          <p className={label}>UNACCOUNTED</p>
          <p className="mt-1 font-mono text-sm uppercase tracking-wider text-zinc-300">
            CASE {data.id} / {data.vessel}
          </p>
        </div>
        <div className="flex items-center gap-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">
            Auxiliary reserve:{" "}
            <span className="text-zinc-100">
              {data.initial_state.auxiliary_reserve_pct}%
            </span>
          </p>
          <button
            onClick={reset}
            disabled={busy}
            className="border border-zinc-700 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-100 disabled:opacity-40"
          >
            Reset case
          </button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[15rem_minmax(0,1fr)_20rem] divide-x divide-zinc-800">
        <nav aria-label="Ship areas" className="p-4">
          <p className={label}>Ship areas</p>
          <ul className="mt-3 space-y-1">
            {data.locations.map((loc) => (
              <li key={loc.id}>
                <button
                  onClick={() => setSelectedId(loc.id)}
                  disabled={!loc.functional}
                  aria-current={loc.id === selected.id}
                  className={`flex w-full items-center justify-between border px-3 py-2 text-left text-sm transition-colors ${
                    loc.id === selected.id
                      ? "border-zinc-500 bg-zinc-900 text-zinc-100"
                      : loc.functional
                        ? "border-transparent text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/60"
                        : "cursor-not-allowed border-transparent text-zinc-600"
                  }`}
                >
                  {loc.name}
                  {!loc.functional && (
                    <span className="font-mono text-[10px] uppercase tracking-wider">
                      Unavailable
                    </span>
                  )}
                </button>
                {data.non_playable_areas
                  .filter((a) => a.branches_from === loc.id)
                  .map((a) => (
                    <div
                      key={a.id}
                      className="ml-4 mt-1 border-l border-zinc-800 pl-3"
                    >
                      <div
                        aria-disabled="true"
                        className="cursor-not-allowed border border-red-950 px-3 py-2"
                      >
                        <p className="text-sm text-zinc-500">{a.name}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase leading-4 tracking-wider text-red-700">
                          Sealed / vacuum
                          <br />
                          Access prohibited
                        </p>
                      </div>
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex flex-col p-8">
          <p className={label}>Selected location</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-wide text-zinc-100">
            {selected.name.toUpperCase()}
          </h2>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
            Accessible / {selectedDone} of {selected.actions.length} record
            {selected.actions.length === 1 ? "" : "s"} recovered
          </p>

          <p className={`${label} mt-10`}>Investigation actions</p>
          <ul className="mt-3 max-w-xl space-y-2">
            {selected.actions.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => perform(a.id)}
                  disabled={busy}
                  className="flex w-full items-center justify-between border border-zinc-700 px-4 py-3 text-left text-zinc-200 transition-colors hover:border-zinc-400 hover:bg-zinc-900 disabled:opacity-50"
                >
                  {a.label}
                  {done(a.id) && (
                    <span className="ml-4 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-600">
                      Completed
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {aftBay && (
            <p className="mt-8 max-w-xl border border-red-950 px-4 py-3 font-mono text-xs uppercase leading-5 tracking-wider text-red-700">
              {aftBay.name} branches from this compartment.
              <br />
              Sealed / vacuum. Access prohibited.
            </p>
          )}

          {error && (
            <p role="alert" className="mt-6 font-mono text-xs text-red-500">
              {error}
            </p>
          )}

          {coreRecovered && (
            <p className="mt-10 border-t border-zinc-800 pt-4 font-mono text-xs uppercase tracking-[0.25em] text-emerald-600">
              Core investigation evidence recovered
            </p>
          )}

          <FinalFinding
            key={epoch}
            finding={data.final_finding}
            state={state}
            evidence={recovered}
            onState={setState}
          />

          <section aria-label="Command SIG team" className="mt-auto pt-12">
            {interpretation && (
              <div className="mb-4 border border-zinc-800 px-4 py-3">
                <p className={label}>Command interpreted</p>
                {interpretation.tasks.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {interpretation.tasks.map((t) => (
                      <li key={t.action}>
                        <p className="text-sm text-zinc-200">
                          <span className="mr-2 font-mono text-xs tracking-[0.2em] text-emerald-600">
                            {ROLE_TAG[t.role]} →
                          </span>
                          {allActions.find((a) => a.id === t.action)?.label ??
                            t.action}
                        </p>
                        <p className="ml-12 mt-0.5 text-xs text-zinc-500">
                          {t.reason}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {interpretation.message && (
                  <p className="mt-3 text-sm text-zinc-400">
                    {interpretation.message}
                  </p>
                )}
                {interpretation.tasks.length === 0 &&
                  !interpretation.message && (
                    <p className="mt-3 text-sm text-zinc-500">
                      No executable tasks.
                    </p>
                  )}
              </div>
            )}
            <form onSubmit={submitCommand} className="flex gap-2">
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                disabled={busy}
                maxLength={500}
                aria-label="Command SIG team"
                placeholder="Command SIG team..."
                className="min-w-0 flex-1 border border-zinc-600 bg-zinc-950 px-4 py-3 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-300 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={busy || !command.trim()}
                className="border border-zinc-500 px-5 py-3 font-mono text-xs uppercase tracking-[0.25em] text-zinc-100 transition-colors hover:border-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
              >
                Execute
              </button>
            </form>
            {interpreting && (
              <p
                role="status"
                className="mt-2 font-mono text-xs uppercase tracking-[0.2em] text-zinc-400"
              >
                Interpreting command...
              </p>
            )}
            {commandError && (
              <p role="alert" className="mt-2 font-mono text-xs text-red-500">
                {commandError}
              </p>
            )}
          </section>
        </main>

        <aside aria-label="Activity feed" className="p-4">
          <p className={label}>Activity feed</p>
          {feed.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">No activity recorded.</p>
          ) : (
            <ol className="mt-3 space-y-4">
              {feed.map((entry, i) => (
                <li
                  key={feed.length - i}
                  className="border-l border-zinc-700 pl-3"
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                    {locationName(entry.location)}
                  </p>
                  {entry.message.split(/(?<=\.)\s+/).map((line, j) => (
                    <p key={j} className="mt-0.5 text-sm text-zinc-300">
                      {line}
                    </p>
                  ))}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>

      <section
        aria-label="Evidence"
        className="border-t border-zinc-800 px-6 py-4"
      >
        <p className={label}>Evidence ({recovered.length})</p>
        {recovered.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">No evidence recovered.</p>
        ) : (
          <div className="mt-3 grid grid-cols-4 gap-4">
            {recovered.map((e) => (
              <article key={e.id} className="border border-zinc-800 p-4">
                <p className="font-mono text-[11px] tracking-[0.2em] text-zinc-500">
                  {e.id}
                </p>
                <h3 className="mt-1 text-sm font-semibold uppercase tracking-wide text-zinc-100">
                  {e.name}
                </h3>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-600">
                  {e.reliability}
                </p>
                <div className="mt-3 space-y-2 text-sm leading-5 text-zinc-400">
                  {e.finding.split("\n\n").map((para, i) => (
                    <p key={i} className="whitespace-pre-line">
                      {para}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
