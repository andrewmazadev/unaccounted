"use client";

import { useEffect, useState } from "react";
import {
  submitReport,
  type CaseData,
  type Evidence,
  type MissionState,
  type ReportResult,
} from "@/lib/api";

const label = "font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500";

export default function FinalFinding({
  finding,
  state,
  evidence,
  onState,
}: {
  finding: CaseData["final_finding"];
  state: MissionState;
  evidence: Evidence[];
  onState: (s: MissionState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [attempt, setAttempt] = useState<ReportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const complete = state.mission_complete;
  const result = state.final_report;
  const choiceText = (id: string) =>
    finding.choices.find((c) => c.id === id)?.text;

  function edit(fn: () => void) {
    fn();
    setAttempt(null);
    setError(null);
  }

  const toggle = (id: string) =>
    edit(() =>
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
      ),
    );

  async function submit() {
    if (!choice || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { state: next, ...r } = await submitReport(choice, selected);
      setAttempt(r);
      onState(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backend unreachable.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-label="Final finding"
      className="mt-10 border-t border-zinc-800 pt-4"
    >
      <p className={label}>Final finding</p>
      {complete ? (
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.2em] text-emerald-600">
          Primary finding established
        </p>
      ) : (
        <p className="mt-2 text-sm text-zinc-400">
          {state.report_available
            ? "Evidence threshold reached."
            : "Insufficient evidence to submit an incident finding."}
        </p>
      )}
      {(state.report_available || complete) && (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 border border-zinc-500 px-4 py-2 font-mono text-xs uppercase tracking-[0.25em] text-zinc-100 transition-colors hover:border-zinc-200 hover:bg-zinc-900"
        >
          {complete ? "Review final finding" : "Open final finding"}
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Final finding"
            onClick={(e) => e.stopPropagation()}
            className="max-h-full w-full max-w-2xl overflow-y-auto border border-zinc-600 bg-zinc-950 p-8"
          >
            <div className="flex items-start justify-between gap-6">
              <h2 className="text-xl font-semibold uppercase tracking-wide text-zinc-100">
                {finding.question}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500 hover:text-zinc-200"
              >
                Close
              </button>
            </div>

            {complete && result ? (
              <div className="mt-6">
                <p className="font-mono text-sm uppercase tracking-[0.25em] text-emerald-500">
                  Finding supported
                </p>
                <p className="mt-3 text-sm text-zinc-400">
                  {choiceText(result.finding_id)}
                </p>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  {result.message}
                </p>
                <dl className="mt-6 space-y-4 border-t border-zinc-800 pt-4">
                  {result.outcome.map((line) => (
                    <div key={line.label}>
                      <dt className={label}>{line.label}:</dt>
                      <dd className="mt-1 font-mono text-sm uppercase tracking-[0.15em] text-zinc-100">
                        {line.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  Basis: {result.submitted_evidence.join(", ")}
                </p>
              </div>
            ) : (
              <>
                <fieldset className="mt-6">
                  <legend className={label}>Conclusion</legend>
                  <div className="mt-3 space-y-2">
                    {finding.choices.map((c, i) => (
                      <label
                        key={c.id}
                        className={`flex cursor-pointer gap-3 border px-4 py-3 text-sm transition-colors ${
                          choice === c.id
                            ? "border-zinc-300 bg-zinc-900 text-zinc-100"
                            : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                        }`}
                      >
                        <input
                          type="radio"
                          name="conclusion"
                          checked={choice === c.id}
                          onChange={() => edit(() => setChoice(c.id))}
                          className="mt-1 accent-zinc-300"
                        />
                        <span>
                          <span className="mr-2 font-mono text-zinc-500">
                            {i + 1}.
                          </span>
                          {c.text}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="mt-6">
                  <legend className={label}>Supporting evidence</legend>
                  <div className="mt-3 space-y-2">
                    {evidence.map((e) => (
                      <label
                        key={e.id}
                        className={`flex cursor-pointer items-center gap-3 border px-4 py-2 text-sm transition-colors ${
                          selected.includes(e.id)
                            ? "border-zinc-300 bg-zinc-900 text-zinc-100"
                            : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(e.id)}
                          onChange={() => toggle(e.id)}
                          className="accent-zinc-300"
                        />
                        <span className="font-mono text-xs tracking-[0.15em] text-zinc-500">
                          {e.id}
                        </span>
                        {e.name}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {attempt && !attempt.supported && (
                  <div
                    role="alert"
                    className="mt-6 border border-red-950 px-4 py-3"
                  >
                    <p className="font-mono text-xs uppercase tracking-[0.25em] text-red-600">
                      Finding not supported
                    </p>
                    <p className="mt-2 text-sm text-zinc-300">
                      {attempt.message}
                    </p>
                  </div>
                )}
                {error && (
                  <p
                    role="alert"
                    className="mt-6 font-mono text-xs text-red-500"
                  >
                    {error}
                  </p>
                )}

                <button
                  onClick={submit}
                  disabled={!choice || submitting}
                  className="mt-6 border border-zinc-500 px-5 py-3 font-mono text-xs uppercase tracking-[0.25em] text-zinc-100 transition-colors hover:border-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
                >
                  Submit finding
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
