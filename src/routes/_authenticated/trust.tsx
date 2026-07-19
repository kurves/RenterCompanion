import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteAllUserData, runSafetyTest } from "@/lib/copilot.functions";
import { clearLog, logAction, readLog, type ConsentEntry } from "@/lib/consent-log";
import { CORPUS_VERSION, EFFECTIVE_DATE, RULE_YEAR } from "@/lib/lihtc-rules";
import { PROPERTY_FEATURES } from "@/lib/discover-data";
import { AlertTriangle, CheckCircle2, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/trust")({
  component: TrustPage,
});

type TestResult = {
  test: "refusal" | "injection" | "deletion";
  reply: string;
  passed: boolean;
  expect: string;
  user_prompt: string;
};

// Features RenterCompanion uses on the profile side. Purpose is public.
const PROFILE_FEATURES: Array<{ field: string; purpose: string }> = [
  { field: "household_size", purpose: "Sizes the HUD per-household income limit." },
  { field: "annual_income_estimate_usd", purpose: "Compared to the published limit — never used to score you." },
  { field: "assets_total_usd", purpose: "Feeds the $5,000 asset-income rule from HUD 4350.3." },
  { field: "city", purpose: "Selects the correct HUD MTSP row." },
  { field: "state", purpose: "Selects the correct HUD MTSP row." },
  { field: "employer_name", purpose: "Displayed back for your confirmation only." },
  { field: "pay_frequency", purpose: "Explains how the annual estimate was derived." },
  { field: "benefit_type", purpose: "Explains why an award letter is on your checklist." },
];

function TrustPage() {
  const qc = useQueryClient();
  const [entries, setEntries] = useState<ConsentEntry[]>([]);
  const [results, setResults] = useState<Record<string, TestResult | "pending">>({});

  useEffect(() => {
    setEntries(readLog());
  }, []);

  const runTest = useMutation({
    mutationFn: async (test: "refusal" | "injection" | "deletion") =>
      runSafetyTest({ data: { test } }),
    onMutate: (test) => {
      setResults((r) => ({ ...r, [test]: "pending" }));
    },
    onSuccess: (data) => {
      setResults((r) => ({ ...r, [data.test]: data as TestResult }));
      logAction(
        data.test === "refusal"
          ? "safety.refusal-test"
          : data.test === "injection"
            ? "safety.injection-test"
            : "safety.deletion-test",
        `passed=${data.passed}`,
      );
      setEntries(readLog());
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Test failed"),
  });

  const deleteAll = useMutation({
    mutationFn: () => deleteAllUserData(),
    onSuccess: () => {
      logAction("session.delete-all", "server rows + local log cleared");
      clearLog();
      setEntries([]);
      qc.clear();
      toast.success("All your session data has been deleted.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <AppShell>
      <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
        <div className="text-xs font-medium uppercase tracking-wide text-primary">Controls</div>
        <h1 className="text-2xl font-semibold">Trust &amp; controls</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Responsible-AI controls you can see and test live. No decisions. No hidden proxies. You
          keep every extracted value correctable and every session deletable.
        </p>

        {/* Rule version */}
        <Card className="mt-5 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheck className="h-4 w-4 text-primary" /> Rule version currently in use
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            LIHTC · HUD MTSP {RULE_YEAR} · <code>{CORPUS_VERSION}</code> · effective{" "}
            {EFFECTIVE_DATE}. Every consent-log entry records this version.
          </div>
        </Card>

        {/* Feature transparency */}
        <h2 className="mt-8 text-lg font-semibold">Every feature we use, and why</h2>
        <p className="text-xs text-muted-foreground">
          These are the ONLY inputs that shape any answer. No demographic, behavioral, or
          landlord-revenue features are used or inferred.
        </p>
        <Card className="mt-3 p-0">
          <div className="border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide">
            Profile inputs
          </div>
          <FeatureTable rows={PROFILE_FEATURES} />
          <div className="border-y bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide">
            Property inputs (Discover)
          </div>
          <FeatureTable
            rows={PROPERTY_FEATURES.map((r) => ({ field: String(r.field), purpose: r.purpose }))}
          />
        </Card>

        {/* Safety tests */}
        <h2 className="mt-8 text-lg font-semibold">Live safety tests</h2>
        <p className="text-xs text-muted-foreground">
          Run these against the same model + system prompt the chat uses. Reply is shown verbatim.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(["refusal", "injection", "deletion"] as const).map((t) => (
            <TestCard
              key={t}
              name={t}
              result={results[t]}
              onRun={() => runTest.mutate(t)}
              busy={results[t] === "pending"}
            />
          ))}
        </div>

        {/* Consent + action log */}
        <h2 className="mt-8 text-lg font-semibold">Consent &amp; action log</h2>
        <p className="text-xs text-muted-foreground">
          Records actions and the rule version — never raw document contents. Stored locally on your
          device.
        </p>
        <Card className="mt-3 max-h-72 overflow-y-auto p-0 text-xs">
          {entries.length === 0 ? (
            <div className="p-4 text-muted-foreground">No entries yet.</div>
          ) : (
            <ul>
              {entries.map((e, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 border-b px-3 py-1.5 last:border-b-0"
                >
                  <span className="w-40 shrink-0 font-mono text-[10px] text-muted-foreground">
                    {new Date(e.ts).toLocaleString()}
                  </span>
                  <span className="w-48 shrink-0 font-medium">{e.action}</span>
                  <span className="flex-1 truncate text-muted-foreground">{e.detail ?? ""}</span>
                  <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                    {e.rule_version}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Session deletion */}
        <h2 className="mt-8 text-lg font-semibold">Delete my session</h2>
        <Card className="mt-3 space-y-3 p-4">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
            <p>
              Removes your household profile, every document, every conversation, and every packet
              from our servers, and clears the local consent log. This cannot be undone.
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm("Delete every trace of your session? This cannot be undone.")) {
                deleteAll.mutate();
              }
            }}
            disabled={deleteAll.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {deleteAll.isPending ? "Deleting…" : "Delete all my session data"}
          </Button>
        </Card>

        <p className="mt-6 text-xs text-muted-foreground">
          Uploads are only used to extract allowlisted fields for your review. We never train models
          on your uploads.
        </p>
      </div>
    </AppShell>
  );
}

function FeatureTable({ rows }: { rows: Array<{ field: string; purpose: string }> }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.field} className="border-b last:border-b-0">
            <td className="w-64 px-4 py-2 font-mono text-xs">{r.field}</td>
            <td className="px-4 py-2 text-muted-foreground">{r.purpose}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TestCard({
  name,
  result,
  onRun,
  busy,
}: {
  name: "refusal" | "injection" | "deletion";
  result: TestResult | "pending" | undefined;
  onRun: () => void;
  busy: boolean;
}) {
  const label =
    name === "refusal"
      ? "Refusal — 'decide for me'"
      : name === "injection"
        ? "Prompt injection in a document"
        : "Session deletion available";
  const done = result && result !== "pending";
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="text-sm font-medium">{label}</div>
      {done ? (
        <>
          <div
            className={`flex items-center gap-1 text-xs ${result.passed ? "text-emerald-600" : "text-destructive"}`}
          >
            {result.passed ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> Passed
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5" /> Review needed
              </>
            )}
          </div>
          <div className="max-h-32 overflow-y-auto rounded bg-muted p-2 text-[11px] whitespace-pre-wrap">
            {result.reply}
          </div>
        </>
      ) : (
        <div className="text-xs text-muted-foreground">
          {busy ? "Running…" : "Click to execute this test against the live model."}
        </div>
      )}
      <Button size="sm" variant="outline" onClick={onRun} disabled={busy}>
        {done ? "Run again" : "Run test"}
      </Button>
    </Card>
  );
}
