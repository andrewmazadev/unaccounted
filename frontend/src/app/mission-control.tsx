"use client";

import { useState } from "react";
import FinalFinding from "./final-finding";
import {
  ClassificationBanner,
  Panel,
  label,
  primaryButton,
  secondaryButton,
} from "./ui";
import {
  investigate,
  resetCase,
  sendCommand,
  type CaseData,
  type Evidence,
  type InterpretedTask,
  type MissionState,
} from "@/lib/api";

const SYSTEM_LOCATIONS: Record<string, string> = { final_report: "Final report" };

const ROLE_TAG: Record<InterpretedTask["role"], string> = {
  engineering: "ENG",
  science: "SCI",
  security: "SEC",
};

const ROLE_NAME: Record<InterpretedTask["role"], string> = {
  engineering: "Engineering",
  science: "Science",
  security: "Security",
};

type Interpretation = {
  command: string;
  tasks: InterpretedTask[];
  message: string | null;
};

type Category = "INVESTIGATION" | "COMMAND" | "FINAL REPORT" | "SYSTEM";

// Player-side events the backend log does not record. `at` is the length of
// the backend event log when the note was made, which fixes its position.
type Note = { at: number; category: Category; lines: string[] };

type FeedItem = {
  category: Category;
  location: string | null;
  lines: string[];
};

const CATEGORY_STYLE: Record<Category, string> = {
  INVESTIGATION: "border-zinc-600 text-zinc-300",
  COMMAND: "border-sky-800 text-sky-300",
  "FINAL REPORT": "border-amber-800 text-amber-300",
  SYSTEM: "border-zinc-700 text-zinc-400",
};

const sentences = (text: string) => text.split(/(?<=\.)\s+/);

function statusTone(value: string) {
  if (["nominal", "stable"].includes(value)) return "text-emerald-400";
  if (["offline", "unavailable", "inactive", "none detected"].includes(value))
    return "text-amber-400";
  return "text-zinc-100";
}

function StatusStrip({ status }: { status: CaseData["initial_state"] }) {
  const items: [string, string][] = [
    ["Reactor", status.primary_reactor],
    ["Aux power", `${status.auxiliary_reserve_pct}%`],
    ["Life support", status.life_support],
    ["Propulsion", status.main_propulsion],
    ["Comms", status.primary_communications],
    ["Life signs", status.life_signs],
  ];
  return (
    <dl
      aria-label="Ship status"
      className="flex flex-wrap gap-x-6 gap-y-1 border-b border-zinc-800 bg-panel px-6 py-2"
    >
      {items.map(([name, value]) => (
        <div key={name} className="flex items-baseline gap-2">
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400">
            {name}
          </dt>
          <dd
            className={`font-mono text-xs font-semibold uppercase tracking-wider ${statusTone(value)}`}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EvidenceCard({ evidence: e }: { evidence: Evidence }) {
  const verified = e.reliability.toLowerCase() === "verified";
  return (
    <article
      className={`border border-zinc-800 border-l-2 bg-panel-raised p-4 ${
        verified ? "border-l-emerald-600" : "border-l-amber-600"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="border border-zinc-600 px-1.5 py-0.5 font-mono text-[11px] tracking-[0.15em] text-zinc-200">
          {e.id}
        </span>
        <span
          className={`font-mono text-[11px] uppercase tracking-[0.2em] ${
            verified ? "text-emerald-400" : "text-amber-400"
          }`}
        >
          {e.reliability}
        </span>
      </div>
      <h3 className="mt-3 text-sm font-semibold uppercase tracking-wide text-zinc-50">
        {e.name}
      </h3>
      <div className="mt-2 space-y-2 text-[13px] leading-5 text-zinc-300">
        {e.finding.split("\n\n").map((para, i) => (
          <p key={i} className="whitespace-pre-line">
            {para}
          </p>
        ))}
      </div>
    </article>
  );
}

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
  const [notes, setNotes] = useState<Note[]>(() => [
    {
      at: initialState.event_log.length,
      category: "SYSTEM",
      lines: ["Investigation opened."],
    },
  ]);

  const locationName = (id: string | null) =>
    data.locations.find((l) => l.id === id)?.name ??
    (id && SYSTEM_LOCATIONS[id]) ??
    id ??
    null;
  const selected =
    data.locations.find((l) => l.id === selectedId) ?? data.locations[0];
  const allActions = data.locations.flatMap((l) => l.actions);
  const done = (id: string) => state.completed_tasks.includes(id);
  const doneCount = (l: CaseData["locations"][number]) =>
    l.actions.filter((a) => done(a.id)).length;
  const coreRecovered =
    allActions.length > 0 && allActions.every((a) => done(a.id));
  const aftBay = data.non_playable_areas.find(
    (a) => a.branches_from === selected.id,
  );
  const available = data.locations.filter((l) => l.functional);
  const unavailable = data.locations.filter((l) => !l.functional);

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
      setNotes([
        { at: 0, category: "SYSTEM", lines: ["Case reset. Investigation reopened."] },
      ]);
    });

  async function submitCommand(e: React.FormEvent) {
    e.preventDefault();
    const text = command.trim();
    if (!text || busy) return;
    const at = state.event_log.length;
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
      setInterpretation({ command: text, tasks: r.tasks, message: r.message });
      setNotes((prev) => [
        ...prev,
        {
          at,
          category: "COMMAND",
          lines: [
            `“${text}”`,
            r.tasks.length > 0
              ? `Tasked: ${[...new Set(r.tasks.map((t) => ROLE_TAG[t.role]))].join(", ")}.`
              : "No executable tasks.",
          ],
        },
      ]);
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

  // Merge backend log entries with player-side notes, oldest first.
  const timeline: FeedItem[] = [];
  const pushNotes = (i: number) =>
    notes
      .filter((n) => n.at === i)
      .forEach((n) =>
        timeline.push({ category: n.category, location: null, lines: n.lines }),
      );
  state.event_log.forEach((entry, i) => {
    pushNotes(i);
    timeline.push({
      category: entry.location === "final_report" ? "FINAL REPORT" : "INVESTIGATION",
      location:
        entry.location === "final_report" ? null : locationName(entry.location),
      lines: sentences(entry.message),
    });
  });
  notes
    .filter((n) => n.at >= state.event_log.length)
    .forEach((n) =>
      timeline.push({ category: n.category, location: null, lines: n.lines }),
    );
  const feed = timeline.map((item, i) => ({ ...item, seq: i + 1 })).reverse();

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <ClassificationBanner />
      <header className="flex items-center justify-between gap-6 border-b border-zinc-800 px-6 py-3">
        <div className="flex items-baseline gap-5">
          <p className={label}>Unaccounted / Mission Control</p>
          <h1 className="font-mono text-lg font-semibold uppercase tracking-[0.12em] text-zinc-50">
            Case {data.id}
            <span className="mx-3 text-zinc-600">/</span>
            {data.vessel}
          </h1>
        </div>
        <button onClick={reset} disabled={busy} className={secondaryButton}>
          Reset case
        </button>
      </header>
      <StatusStrip status={data.initial_state} />

      <div className="grid flex-1 grid-cols-[14rem_minmax(0,1fr)_21rem] items-start gap-4 p-4">
        <nav aria-label="Ship areas" className="space-y-4">
          <Panel title="Investigation areas" ariaLabel="Available areas">
            <ul className="space-y-1 p-2">
              {available.map((loc) => {
                const active = loc.id === selected.id;
                const sealed = data.non_playable_areas.filter(
                  (a) => a.branches_from === loc.id,
                );
                return (
                  <li key={loc.id}>
                    <button
                      onClick={() => setSelectedId(loc.id)}
                      aria-current={active}
                      className={`flex w-full items-center justify-between border px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? "border-zinc-400 bg-panel-raised text-zinc-50"
                          : "border-transparent text-zinc-300 hover:border-zinc-700 hover:bg-panel-raised"
                      }`}
                    >
                      {loc.name}
                      <span className="font-mono text-[11px] tracking-wider text-zinc-400">
                        {doneCount(loc)}/{loc.actions.length}
                      </span>
                    </button>
                    {sealed.map((a) => (
                      <div
                        key={a.id}
                        aria-label={`${a.name}: sealed, vacuum, access prohibited`}
                        className="ml-4 mt-1 border border-red-900/70 bg-red-950/20 px-3 py-2"
                      >
                        <p className="text-sm text-zinc-400">{a.name}</p>
                        <p className="mt-1 font-mono text-[11px] uppercase leading-4 tracking-wider text-red-400">
                          Sealed / Vacuum
                          <br />
                          Access prohibited
                        </p>
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Unavailable" ariaLabel="Unavailable areas">
            <ul className="space-y-1 p-2">
              {unavailable.map((loc) => (
                <li
                  key={loc.id}
                  className="flex items-center justify-between px-3 py-2 text-sm text-zinc-400"
                >
                  {loc.name}
                  <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                    Offline
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </nav>

        <main className="space-y-4">
          <Panel
            title="Command SIG Team"
            meta={
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                ENG · SCI · SEC
              </span>
            }
            className="border-zinc-600"
          >
            <div className="p-4">
              <form onSubmit={submitCommand}>
                <textarea
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  disabled={busy}
                  maxLength={500}
                  rows={3}
                  aria-label="Command SIG Team"
                  placeholder="Engineering, inspect the reactor while Science reconstructs the accident..."
                  className="block w-full resize-none border border-zinc-500 bg-background px-4 py-3 text-sm leading-6 text-zinc-50 placeholder:text-zinc-500 focus:border-zinc-200 disabled:opacity-60"
                />
                <div className="mt-3 flex items-center justify-between gap-4">
                  <p className="text-xs text-zinc-500">
                    Address one or more team leads in plain language.
                  </p>
                  <button
                    type="submit"
                    disabled={busy || !command.trim()}
                    className={`${primaryButton} min-w-36`}
                  >
                    {interpreting ? "Interpreting" : "Execute"}
                  </button>
                </div>
              </form>
              {interpreting && (
                <p
                  role="status"
                  className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400"
                >
                  Interpreting command / Tasking team...
                </p>
              )}
              {commandError && (
                <p role="alert" className="mt-3 font-mono text-xs text-red-400">
                  {commandError}
                </p>
              )}

              {interpretation && !interpreting && (
                <div
                  aria-label="Command interpreted"
                  className="mt-4 border border-zinc-700 bg-panel-raised"
                >
                  <div className="border-b border-zinc-700 px-4 py-2">
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sky-300">
                      Command interpreted
                    </p>
                  </div>
                  {interpretation.tasks.length > 0 && (
                    <ul className="divide-y divide-zinc-800">
                      {interpretation.tasks.map((t) => (
                        <li
                          key={t.action}
                          className="flex items-center gap-4 px-4 py-2.5"
                        >
                          <span
                            aria-label={ROLE_NAME[t.role]}
                            className="w-12 shrink-0 border border-zinc-600 py-0.5 text-center font-mono text-xs font-semibold tracking-[0.15em] text-zinc-100"
                          >
                            {ROLE_TAG[t.role]}
                          </span>
                          <span className="text-sm text-zinc-100">
                            {allActions.find((a) => a.id === t.action)?.label ??
                              t.action}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {interpretation.message && (
                    <p className="border-t border-zinc-800 px-4 py-2.5 text-sm text-zinc-300 first:border-t-0">
                      {interpretation.message}
                    </p>
                  )}
                  {interpretation.tasks.length === 0 &&
                    !interpretation.message && (
                      <p className="px-4 py-2.5 text-sm text-zinc-400">
                        No executable tasks.
                      </p>
                    )}
                </div>
              )}
            </div>
          </Panel>

          <Panel
            title="Investigation"
            meta={
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400">
                Accessible
              </span>
            }
          >
            <div className="p-4">
              <h2 className="text-xl font-semibold uppercase tracking-wide text-zinc-50">
                {selected.name}
              </h2>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                {doneCount(selected)} of {selected.actions.length} record
                {selected.actions.length === 1 ? "" : "s"} recovered
              </p>

              <ul className="mt-4 space-y-2">
                {selected.actions.map((a) => (
                  <li key={a.id}>
                    <button
                      onClick={() => perform(a.id)}
                      disabled={busy}
                      className="flex w-full items-center justify-between border border-zinc-700 px-4 py-3 text-left text-sm text-zinc-100 transition-colors hover:border-zinc-400 hover:bg-panel-raised disabled:opacity-50"
                    >
                      {a.label}
                      {done(a.id) ? (
                        <span className="ml-4 font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400">
                          Completed
                        </span>
                      ) : (
                        <span className="ml-4 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                          Run
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              {aftBay && (
                <div className="mt-4 border border-red-900/70 bg-red-950/20 px-4 py-3">
                  <p className="text-sm font-semibold uppercase tracking-wide text-zinc-200">
                    {aftBay.name}
                  </p>
                  <p className="mt-1 font-mono text-[11px] uppercase leading-5 tracking-wider text-red-400">
                    Sealed / Vacuum / Access prohibited
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Branches from this compartment.
                  </p>
                </div>
              )}

              {error && (
                <p role="alert" className="mt-4 font-mono text-xs text-red-400">
                  {error}
                </p>
              )}

              {coreRecovered && (
                <p className="mt-4 border-t border-zinc-800 pt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400">
                  Core investigation evidence recovered
                </p>
              )}
            </div>
          </Panel>
        </main>

        <aside aria-label="Case status" className="space-y-4">
          <FinalFinding
            key={epoch}
            finding={data.final_finding}
            caseId={data.id}
            state={state}
            evidence={recovered}
            onState={setState}
          />

          <Panel
            title="Activity"
            ariaLabel="Activity feed"
            meta={
              <span className="font-mono text-[11px] text-zinc-500">
                {feed.length}
              </span>
            }
          >
            <ol
              tabIndex={0}
              aria-label="Activity log, newest first"
              className="max-h-[32rem] divide-y divide-zinc-800 overflow-y-auto"
            >
              {feed.map((item) => (
                <li key={item.seq} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-zinc-500">
                      {String(item.seq).padStart(2, "0")}
                    </span>
                    <span
                      className={`border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.15em] ${CATEGORY_STYLE[item.category]}`}
                    >
                      {item.category}
                    </span>
                    {item.location && (
                      <span className="truncate font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                        {item.location}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-sm text-zinc-200">
                    {item.lines.map((line, j) => (
                      <p key={j}>{line}</p>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </aside>
      </div>

      <section
        aria-label="Evidence"
        className="border-t border-zinc-800 bg-panel px-6 py-4"
      >
        <div className="flex items-baseline gap-3">
          <h2 className={label}>Recovered evidence</h2>
          <span className="font-mono text-[11px] text-zinc-500">
            {recovered.length}
          </span>
        </div>
        {recovered.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            No evidence recovered. Findings register here as records are
            recovered.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(21rem,1fr))] items-start gap-4">
            {recovered.map((e) => (
              <EvidenceCard key={e.id} evidence={e} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
