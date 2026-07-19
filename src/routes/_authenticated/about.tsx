import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { CORPUS_VERSION, EFFECTIVE_DATE, RULE_YEAR } from "@/lib/lihtc-rules";

export const Route = createFileRoute("/_authenticated/about")({
  component: AboutPage,
  head: () => ({
    meta: [
      { title: "Architecture & risk note · RenterCompanion" },
      {
        name: "description",
        content:
          "How RenterCompanion is built, what the AI does and does not do, and the risks we accept.",
      },
    ],
  }),
});

function AboutPage() {
  return (
    <AppShell>
      <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6 space-y-6">
        <header>
          <div className="text-xs font-medium uppercase tracking-wide text-primary">
            Architecture & risk note
          </div>
          <h1 className="text-2xl font-semibold">How RenterCompanion is built</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The AI extracts, explains, retrieves, calculates, and prepares. The renter confirms.
            A qualified human decides.
          </p>
        </header>

        <Card className="p-5 space-y-3">
          <h2 className="text-lg font-semibold">Deliverables at a glance</h2>
          <ul className="space-y-2 text-sm">
            <Item label="Profile → Understand → Prepare">
              End-to-end flow: extract allowlisted fields from a synthetic PDF, confirm each on the
              profile, compare confirmed inputs to a cited threshold, then export a renter-controlled
              packet with checklist gaps flagged.
            </Item>
            <Item label="Recorded sources, effective dates, deterministic calculations">
              The rule corpus is versioned (<code>{CORPUS_VERSION}</code>, effective{" "}
              {EFFECTIVE_DATE}, rule year {RULE_YEAR}). Every limit shows its HUD source URL,
              formula, and citations. Math is a pure function of the confirmed inputs.
            </Item>
            <Item label="Field correction, uncertainty, abstention">
              Every extracted field is editable and shown with a confidence badge and verbatim
              source snippet. Nothing lands on the profile until the renter confirms. If a city
              is not in the corpus or an input is missing, the app abstains — never labels the
              renter eligible.
            </Item>
            <Item label="Deletion & renter-controlled packet">
              Trust & controls → "Delete all my session data" wipes profile, documents, threads,
              messages, packets, and the on-device consent log. Packets are preview / download /
              delete only — never auto-sent to a property or provider.
            </Item>
          </ul>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="text-lg font-semibold">Architecture</h2>
          <ul className="space-y-2 text-sm">
            <Row k="Frontend">TanStack Start (React 19 + Vite), Tailwind, shadcn/ui.</Row>
            <Row k="Backend">
              TanStack server functions (typed RPC). Auth-gated routes under{" "}
              <code>/_authenticated</code>. No hand-rolled edge functions.
            </Row>
            <Row k="Data">
              Lovable Cloud (Postgres). Row-Level Security scopes every row to{" "}
              <code>auth.uid()</code>. Tables: <code>threads</code>, <code>messages</code>,{" "}
              <code>documents</code>, <code>household_profiles</code>,{" "}
              <code>readiness_packets</code>.
            </Row>
            <Row k="AI">
              Lovable AI Gateway. Chat & tool calls stream to <code>/api/chat</code>; PDF
              extraction runs server-side with a strict field allowlist. Uploads are not used for
              training.
            </Row>
            <Row k="Rules engine">
              <code>src/lib/lihtc-rules.ts</code> — versioned corpus + pure functions{" "}
              <code>computeIncomeLimit</code> and <code>assessFit</code>. Deterministic; abstains
              on unknown inputs.
            </Row>
            <Row k="Consent log">
              On-device only (<code>localStorage</code>). Records actions and rule versions —
              never raw document contents.
            </Row>
          </ul>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="text-lg font-semibold">What the AI does — and does not do</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Does
              </div>
              <ul className="mt-1 space-y-1 text-sm">
                <li>Extract allowlisted fields with confidence + source snippet</li>
                <li>Explain LIHTC rules with citations</li>
                <li>Run deterministic math against a versioned corpus</li>
                <li>Flag missing / expired items against a gold checklist</li>
              </ul>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-destructive">
                Does not
              </div>
              <ul className="mt-1 space-y-1 text-sm">
                <li>Approve, deny, score, or rank renters</li>
                <li>Infer or use protected traits or proxies</li>
                <li>Auto-send anything to a property or provider</li>
                <li>Follow instructions embedded in uploaded documents</li>
              </ul>
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="text-lg font-semibold">Risks & mitigations</h2>
          <ul className="space-y-2 text-sm">
            <Risk r="Model hallucination on rules">
              Rules and thresholds come from the versioned corpus, not the model. The model cites
              corpus entries; unknown inputs trigger abstention.
            </Risk>
            <Risk r="Extraction errors">
              Every field requires human confirmation. Confidence and source snippet are shown
              inline; nothing writes to the profile without a click.
            </Risk>
            <Risk r="Prompt injection via documents">
              Document text is treated as untrusted data. System prompt forbids following
              in-document instructions; a live injection test is on Trust & controls.
            </Risk>
            <Risk r="Sample corpus coverage">
              The 2025 sample corpus covers four counties. Anything outside abstains rather than
              guess. Production would swap in the full HUD MTSP dataset with the same interface.
            </Risk>
            <Risk r="Data exposure">
              RLS scopes rows per user; publishable keys only in the browser; service-role never
              client-side. Renter can wipe all data at any time.
            </Risk>
            <Risk r="Availability signals">
              Discover labels availability as <em>unknown</em> unless separately supplied. No
              ranking, no acceptance prediction, no protected-trait features.
            </Risk>
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li>
      <div className="font-medium">{label}</div>
      <div className="text-muted-foreground">{children}</div>
    </li>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[8rem_1fr] gap-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {k}
      </div>
      <div>{children}</div>
    </li>
  );
}

function Risk({ r, children }: { r: string; children: React.ReactNode }) {
  return (
    <li>
      <div className="font-medium">{r}</div>
      <div className="text-muted-foreground">{children}</div>
    </li>
  );
}
