import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getProfile,
  saveProfile,
  extractFromText,
  extractFromPdf,
  addDocument,
  type ExtractedField,
} from "@/lib/copilot.functions";
import { CheckCircle2, ShieldCheck, Sparkles, Upload, X, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

type ProfileData = {
  household_size?: number;
  annual_income_estimate_usd?: number;
  assets_total_usd?: number;
  city?: string;
  state?: string;
  employer_name?: string;
  benefit_type?: string;
  benefit_monthly_usd?: number;
  notes?: string;
};

const NUMERIC_FIELDS = new Set([
  "household_size",
  "annual_income_estimate_usd",
  "assets_total_usd",
  "gross_pay_per_period_usd",
  "benefit_monthly_usd",
]);

function ProfilePage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });
  const [form, setForm] = useState<ProfileData>({});

  useEffect(() => {
    if (data?.data) setForm(data.data as ProfileData);
  }, [data]);

  const save = useMutation({
    mutationFn: (confirm: boolean) =>
      saveProfile({ data: { data: form as Record<string, unknown>, confirm } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile saved");
    },
  });

  // ---- Extraction stage ----
  const [docText, setDocText] = useState("");
  const [docHint, setDocHint] = useState("pay_stub");
  const [pdfFile, setPdfFile] = useState<{ name: string; base64: string } | null>(null);
  const [proposals, setProposals] = useState<ExtractedField[]>([]);
  const [rejected, setRejected] = useState<Set<number>>(new Set());

  const extract = useMutation({
    mutationFn: async () => {
      const res = pdfFile
        ? await extractFromPdf({
            data: { filename: pdfFile.name, pdf_base64: pdfFile.base64, doc_hint: docHint },
          })
        : await extractFromText({ data: { text: docText, doc_hint: docHint } });
      // Persist the source document so it also appears on the Documents page.
      const docTypeMap: Record<string, string> = {
        pay_stub: "pay_stubs",
        benefit_award_letter: "benefits_award_letter",
        bank_statement: "bank_statements",
        other: "other",
      };
      const doc_type = docTypeMap[docHint] ?? docHint;
      const label = pdfFile
        ? pdfFile.name
        : `${docHint.replace(/_/g, " ")} — ${new Date().toLocaleDateString()}`;
      const content = pdfFile
        ? `PDF uploaded on profile (${res.fields.length} field${res.fields.length === 1 ? "" : "s"} proposed).`
        : docText.slice(0, 4000);
      try {
        await addDocument({
          data: {
            doc_type,
            label,
            content,
            source: pdfFile ? "extract.pdf" : "extract.text",
          },
        });
      } catch {
        // non-fatal — extraction still succeeded
      }
      return res;
    },
    onSuccess: (res) => {
      setProposals(res.fields);
      setRejected(new Set());
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["readiness"] });
      if (res.fields.length === 0)
        toast.info("Nothing confidently extractable — you can still fill fields manually.");
      else toast.success("Extracted and saved to Documents.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleFile(f: File) {
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please upload a PDF file.");
      return;
    }
    const buf = await f.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    setPdfFile({ name: f.name, base64 });
    setDocText("");
    toast.success(`Loaded ${f.name}`);
  }

  function confirmField(idx: number) {
    const p = proposals[idx];
    if (!p) return;
    const key = p.field as keyof ProfileData;
    const val: unknown = NUMERIC_FIELDS.has(p.field) ? Number(p.value) : p.value;
    setForm((prev) => ({ ...prev, [key]: val as never }));
    setProposals((prev) => prev.filter((_, i) => i !== idx));
    toast.success(`${p.field} added to draft — remember to Save and confirm below.`);
  }
  function rejectField(idx: number) {
    setProposals((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <AppShell>
      <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
        <div className="text-xs font-medium uppercase tracking-wide text-primary">Stage 01</div>
        <h1 className="text-2xl font-semibold">Profile — human-confirmed extraction</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload or paste a synthetic pay stub or benefit letter. RenterCompanion proposes only
          allowlisted fields with a source snippet and confidence — nothing is saved until you
          confirm.
        </p>

        {data?.confirmed_at && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Profile confirmed {new Date(data.confirmed_at).toLocaleDateString()}
          </div>
        )}

        {/* --- Extract from document --- */}
        <Card className="mt-6 space-y-3 p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Extract from a document</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <Label htmlFor="hint">Document type</Label>
              <select
                id="hint"
                value={docHint}
                onChange={(e) => setDocHint(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="pay_stub">Pay stub</option>
                <option value="benefit_award_letter">Benefit award letter</option>
                <option value="bank_statement">Bank statement</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
                <Upload className="h-4 w-4" />
                Upload PDF
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </label>
            </div>
          </div>
          {pdfFile ? (
            <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="truncate">📄 {pdfFile.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setPdfFile(null)}>
                <X className="h-3.5 w-3.5" />
                Remove
              </Button>
            </div>
          ) : (
            <Textarea
              rows={6}
              value={docText}
              onChange={(e) => setDocText(e.target.value)}
              placeholder="Upload a synthetic PDF above, or paste document text here. Nothing leaves your account except the request to the extraction model."
            />
          )}
          <div className="flex items-center gap-2">
            <Button
              onClick={() => extract.mutate()}
              disabled={extract.isPending || (!pdfFile && docText.length < 10)}
            >
              <Sparkles className="h-4 w-4" />
              {extract.isPending ? "Extracting…" : "Extract allowlisted fields"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Only allowlisted fields are extracted; anything else is dropped.
            </span>
          </div>
        </Card>

        {/* --- Proposals --- */}
        {proposals.length > 0 && (
          <Card className="mt-4 space-y-3 p-6">
            <h3 className="text-sm font-semibold">Proposed updates</h3>
            <p className="text-xs text-muted-foreground">
              Nothing is saved until you confirm the field AND press "Save and confirm" below.
            </p>
            <ul className="space-y-3">
              {proposals.map((p, idx) => {
                if (rejected.has(idx)) return null;
                const conf = Math.round(p.confidence * 100);
                const tone =
                  p.confidence >= 0.8
                    ? "bg-emerald-500/10 text-emerald-700"
                    : p.confidence >= 0.6
                      ? "bg-amber-500/10 text-amber-700"
                      : "bg-muted text-muted-foreground";
                return (
                  <li key={idx} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{p.field}</div>
                        <div className="text-sm">{String(p.value)}</div>
                      </div>
                      <span className={`rounded px-2 py-0.5 text-xs ${tone}`}>{conf}% confident</span>
                    </div>
                    {p.source_snippet && (
                      <blockquote className="mt-2 rounded border-l-2 border-primary/40 bg-muted/50 px-2 py-1 text-xs italic text-muted-foreground">
                        “{p.source_snippet}”
                      </blockquote>
                    )}
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" onClick={() => confirmField(idx)}>
                        <Check className="h-3.5 w-3.5" />
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => rejectField(idx)}>
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {/* --- Manual form / correction --- */}
        <Card className="mt-6 space-y-4 p-6">
          <h2 className="text-sm font-semibold">Review and correct</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="hh">Household size</Label>
              <Input
                id="hh"
                type="number"
                min={1}
                value={form.household_size ?? ""}
                onChange={(e) =>
                  setForm({ ...form, household_size: Number(e.target.value) || undefined })
                }
              />
            </div>
            <div>
              <Label htmlFor="inc">Estimated annual income (USD)</Label>
              <Input
                id="inc"
                type="number"
                min={0}
                value={form.annual_income_estimate_usd ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    annual_income_estimate_usd: Number(e.target.value) || undefined,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="assets">Total assets (USD)</Label>
              <Input
                id="assets"
                type="number"
                min={0}
                value={form.assets_total_usd ?? ""}
                onChange={(e) =>
                  setForm({ ...form, assets_total_usd: Number(e.target.value) || undefined })
                }
              />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={form.city ?? ""}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="state">State (2 letters)</Label>
              <Input
                id="state"
                maxLength={2}
                value={form.state ?? ""}
                onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label htmlFor="employer">Employer</Label>
              <Input
                id="employer"
                value={form.employer_name ?? ""}
                onChange={(e) => setForm({ ...form, employer_name: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Anything a property should know — e.g. voucher, adult student status, income variation."
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => save.mutate(true)} disabled={save.isPending}>
              <ShieldCheck className="h-4 w-4" />
              Save and confirm
            </Button>
            <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>
              Save draft
            </Button>
          </div>
        </Card>

        <p className="mt-6 text-xs text-muted-foreground">
          RenterCompanion does not decide eligibility. Confirmation here only means "this is what
          I'm willing to reuse in later stages."
        </p>
      </div>
    </AppShell>
  );
}
