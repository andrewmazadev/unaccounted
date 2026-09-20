import { getCase, type CaseData } from "@/lib/api";
import CaseFile from "./case-file";

export const dynamic = "force-dynamic";

export default async function Home() {
  let caseData: CaseData | null = null;
  try {
    caseData = await getCase();
  } catch {
    // fall through to the offline notice
  }

  if (!caseData) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-500">
          Connection failure
        </p>
        <p className="mt-3 text-zinc-300">
          Case file unavailable. Confirm the backend is running, then reload.
        </p>
      </main>
    );
  }

  return <CaseFile data={caseData} />;
}
