"use client";

import { useEffect, useRef, useState } from "react";
import {
  submitReport,
  type CaseData,
  type Evidence,
  type MissionState,
  type ReportResult,
} from "@/lib/api";

import { Panel, label, primaryButton, secondaryButton } from "./ui";

export default function FinalFinding({
  finding,
  caseId,
  state,
  evidence,
  onState,
}: {
  finding: CaseData["final_finding"];
  caseId: string;
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

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
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

  const locked = !complete && !state.report_available;

  return (
    <>
      <Panel
        title="Final finding"
        meta={
          <span
            className={`border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.15em] ${
              complete
                ? "border-emerald-700 text-emerald-400"
                : locked
                  ? "border-zinc-700 text-zinc-400"
                  : "border-amber-700 text-amber-300"
            }`}
          >
            {complete ? "Established" : locked ? "Locked" : "Available"}
          </span>
        }
        className={
          complete
            ? "border-emerald-800"
            : locked
              ? ""
              : "border-amber-800"
        }
      >
        <div className="p-4">
          {complete ? (
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">
              Primary finding established
            </p>
          ) : (
            <p className="text-sm text-zinc-300">
              {state.report_available
                ? "Evidence threshold reached."
                : "Insufficient evidence to submit an incident finding."}
            </p>
          )}
          {!locked && (
            <button
              onClick={() => setOpen(true)}
              className={`mt-3 w-full ${complete ? secondaryButton : primaryButton}`}
            >
              {complete ? "Review final finding" : "Open final finding"}
            </button>
          )}
        </div>
      </Panel>

      {open && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Final finding"
            onClick={(e) => e.stopPropagation()}
            className={`max-h-full w-full max-w-2xl overflow-y-auto border bg-panel p-8 focus:outline-none ${
              complete && result ? "border-emerald-700" : "border-zinc-600"
            }`}
          >
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className={label}>
                  Case {caseId} / Final finding
                </p>
                <h2 className="mt-2 text-xl font-semibold uppercase tracking-wide text-zinc-50">
                  {finding.question}
                </h2>
              </div>
              <button onClick={() => setOpen(false)} className={secondaryButton}>
                Close
              </button>
            </div>

            {complete && result ? (
              <div className="mt-6">
                <div className="border-y border-emerald-800 bg-emerald-950/30 px-4 py-4">
                  <p className="font-mono text-2xl font-semibold uppercase tracking-[0.2em] text-emerald-400">
                    Finding supported
                  </p>
                </div>
                <p className="mt-5 text-sm leading-6 text-zinc-200">
                  {choiceText(result.finding_id)}
                </p>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {result.message}
                </p>
                <dl className="mt-6 divide-y divide-zinc-800 border border-zinc-700">
                  {result.outcome.map((line) => (
                    <div key={line.label} className="px-4 py-3">
                      <dt className={label}>{line.label}</dt>
                      <dd className="mt-1 font-mono text-base font-semibold uppercase tracking-[0.15em] text-zinc-50">
                        {line.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-5 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                  Basis
                  {result.submitted_evidence.map((id) => (
                    <span
                      key={id}
                      className="border border-zinc-600 px-1.5 py-0.5 text-zinc-200"
                    >
                      {id}
                    </span>
                  ))}
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
                        className={`flex cursor-pointer gap-3 border px-4 py-3 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-zinc-200 ${
                          choice === c.id
                            ? "border-zinc-300 bg-panel-raised text-zinc-50"
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
                          <span className="mr-2 font-mono text-zinc-400">
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
                        className={`flex cursor-pointer items-center gap-3 border px-4 py-2 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-zinc-200 ${
                          selected.includes(e.id)
                            ? "border-zinc-300 bg-panel-raised text-zinc-50"
                            : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(e.id)}
                          onChange={() => toggle(e.id)}
                          className="accent-zinc-300"
                        />
                        <span className="font-mono text-xs tracking-[0.15em] text-zinc-400">
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
                    className="mt-6 border border-red-900 bg-red-950/20 px-4 py-3"
                  >
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-red-400">
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
                    className="mt-6 font-mono text-xs text-red-400"
                  >
                    {error}
                  </p>
                )}

                <button
                  onClick={submit}
                  disabled={!choice || submitting}
                  className={`mt-6 ${primaryButton}`}
                >
                  Submit finding
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
