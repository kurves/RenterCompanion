import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { assessProfileFit, computeLimit, getProfile } from "@/lib/copilot.functions";
import {
  CORPUS_VERSION,
  EFFECTIVE_DATE,
  MTSP_2025,
  RULE_YEAR,
  type AmiSet,
} from "@/lib/lihtc-rules";
import { LIHTC_CITATIONS } from "@/lib/lihtc-knowledge";
import { AlertTriangle, BookOpen, CheckCircle2, ExternalLink, ScaleIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/understand")({
  component: UnderstandPage,
});

function UnderstandPage() {
  const [ami, setAmi] = useState<AmiSet>(60);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });
  const { data: fit } = useQuery({
    queryKey: ["fit", ami],
    queryFn: () => assessProfileFit({ data: { ami_set: ami } }),
  });

  const p = (profile?.data ?? {}) as {
    household_size?: number;
    annual_income_estimate_usd?: number;
    city?: string;
    state?: string;
  };

  const { data: limitPreview } = useQuery({
    queryKey: ["limit", p.city, p.state, p.household_size, ami],
    queryFn: () =>
      computeLimit({
        data: {
          city: p.city ?? null,
          state: p.state ?? null,
          household_size: p.household_size ?? null,
          ami_set: ami,
        },
      }),
    enabled: Boolean(p.city && p.state && p.household_size),
  });

  return (
    <AppShell>
      <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
        <div className="text-xs font-medium uppercase tracking-wide text-primary">Stage 02</div>
        <h1 className="text-2xl font-semibold">Understand — cited rules & deterministic math</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One program, one rule year. Every number below has a source, a threshold, a formula, and
          an effective date. When any input is uncertain, RenterCompanion abstains.
        </p>

        {/* Corpus banner */}
        <Card className="mt-5 flex flex-wrap items-center gap-3 p-4 text-sm">
          <BookOpen className="h-4 w-4 text-primary" />
          <div>
            <div className="font-medium">
              LIHTC · HUD MTSP {RULE_YEAR}
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                {CORPUS_VERSION}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Effective {EFFECTIVE_DATE}. Sample corpus — {MTSP_2025.length} counties for the demo.
            </div>
          </div>
        </Card>

        {/* AMI switcher */}
        <div className="mt-6 flex items-center gap-2">
          <span className="text-sm font-medium">AMI set-aside</span>
          {[50, 60, 80].map((v) => (
            <Button
              key={v}
              size="sm"
              variant={ami === v ? "default" : "outline"}
              onClick={() => setAmi(v as AmiSet)}
            >
              {v}%
            </Button>
          ))}
        </div>

        {/* Income limit result */}
        <Card className="mt-4 space-y-3 p-6">
          <div className="flex items-center gap-2">
            <ScaleIcon className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Income limit for your household</h2>
          </div>

          {!limitPreview ? (
            <AbstainBlock reason="Add city, state, and household size on the Profile page." />
          ) : limitPreview.status === "abstain" ? (
            <AbstainBlock reason={limitPreview.reason ?? "Missing inputs."} />
          ) : (
            <div className="space-y-3 text-sm">
              <Row label="Confirmed input">
                {p.household_size}-person household in {p.city}, {p.state}
              </Row>
              <Row label="Threshold">
                <span className="font-mono text-base">${limitPreview.limit_usd?.toLocaleString()}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  ({ami}% AMI, {RULE_YEAR})
                </span>
              </Row>
              <Row label="Formula">
                <code className="rounded bg-muted px-2 py-1 text-xs">{limitPreview.formula}</code>
              </Row>
              <Row label="Source">
                <a
                  href={limitPreview.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  HUD MTSP {RULE_YEAR} <ExternalLink className="h-3 w-3" />
                </a>
              </Row>
              <Row label="Effective">{limitPreview.effective_date}</Row>
              <Row label="Citations">
                <div className="flex flex-wrap gap-1">
                  {(limitPreview.citations ?? []).map((cid) => {
                    const c = LIHTC_CITATIONS[cid];
                    return (
                      <a
                        key={cid}
                        href={c?.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary hover:underline"
                      >
                        [{c?.label ?? cid}]
                      </a>
                    );
                  })}
                </div>
              </Row>
            </div>
          )}
        </Card>

        {/* Fit assessment */}
        <Card className="mt-4 space-y-3 p-6">
          <h2 className="text-sm font-semibold">Comparison to your confirmed income</h2>
          {!fit ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : fit.status === "abstain" ? (
            <AbstainBlock reason={fit.reason} />
          ) : (
            <div className="space-y-2 text-sm">
              <Row label="Confirmed income">
                ${fit.confirmed_income_usd.toLocaleString()}/yr
              </Row>
              <Row label="Published limit">
                ${fit.limit.limit_usd?.toLocaleString()}/yr
              </Row>
              <Row label="Difference">
                <span className="font-mono">
                  {fit.margin_usd >= 0 ? "-" : "+"}${Math.abs(fit.margin_usd).toLocaleString()}
                </span>{" "}
                {fit.status === "under_limit" ? "under the limit" : "over the limit"}
              </Row>
              <div
                className={`rounded-md p-3 text-sm ${fit.status === "under_limit" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-800"}`}
              >
                {fit.status === "under_limit" ? (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4" />
                    Your reported income is BELOW the published {ami}% AMI limit for this city.
                    That does not make you eligible — only a property's compliance staff can certify
                    a household.
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                    Your reported income is ABOVE the published {ami}% AMI limit. Some properties
                    use different set-asides or the average-income test — a property's compliance
                    staff makes the call.
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{fit.disclaimer}</p>
            </div>
          )}
        </Card>

        <p className="mt-6 text-xs text-muted-foreground">
          Corpus version {CORPUS_VERSION}. RenterCompanion never labels you eligible or ineligible.
        </p>
      </div>
    </AppShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function AbstainBlock({ reason }: { reason: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
      <div>
        <div className="font-medium">Abstaining</div>
        <div className="text-xs text-muted-foreground">{reason}</div>
      </div>
    </div>
  );
}
