import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addDocument, deleteDocument, getReadiness, listDocuments } from "@/lib/copilot.functions";
import { LIHTC_REQUIRED_DOCS } from "@/lib/lihtc-knowledge";
import { AlertTriangle, CheckCircle2, FileText, Plus, Trash2, Upload, X, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/documents")({
  component: DocumentsPage,
});

function DocumentsPage() {
  const qc = useQueryClient();
  const { data: docs = [] } = useQuery({ queryKey: ["documents"], queryFn: () => listDocuments() });
  const { data: readiness = [] } = useQuery({ queryKey: ["readiness"], queryFn: () => getReadiness() });

  const [form, setForm] = useState({
    doc_type: LIHTC_REQUIRED_DOCS[0].key,
    label: "",
    content: "",
    issued_on: "",
    expires_on: "",
  });
  const [pdfName, setPdfName] = useState<string | null>(null);

  async function handlePdfPick(f: File) {
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please upload a PDF file.");
      return;
    }
    setPdfName(f.name);
    setForm((prev) => ({
      ...prev,
      label: prev.label || f.name,
      content: prev.content || `PDF attached: ${f.name} (${Math.round(f.size / 1024)} KB)`,
    }));
    toast.success(`Attached ${f.name}`);
  }

  const add = useMutation({
    mutationFn: () =>
      addDocument({
        data: {
          doc_type: form.doc_type,
          label: form.label || LIHTC_REQUIRED_DOCS.find((r) => r.key === form.doc_type)!.label,
          content: form.content,
          issued_on: form.issued_on || null,
          expires_on: form.expires_on || null,
          source: pdfName ? "pdf" : "manual",
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["readiness"] });
      setForm({ ...form, label: "", content: "", issued_on: "", expires_on: "" });
      setPdfName(null);
      toast.success("Document added");
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteDocument({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["readiness"] });
    },
  });

  return (
    <AppShell>
      <div className="mx-auto h-full max-w-4xl overflow-y-auto p-6">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add anything you'd hand a property manager. I'll flag what's missing or stale against the
          standard LIHTC document set.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">LIHTC checklist</h2>
            <ul className="mt-3 space-y-2">
              {readiness.map((r) => (
                <li key={r.key} className="flex items-start gap-2 text-sm">
                  {r.status === "present" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  ) : r.status === "expired" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <div className="font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.status === "present"
                        ? "On file"
                        : r.status === "expired"
                          ? "Refresh needed"
                          : "Missing"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold">Add a document</h2>
            <div className="mt-3 space-y-3">
              <div>
                <Label>Document type</Label>
                <Select
                  value={form.doc_type}
                  onValueChange={(v) => setForm({ ...form, doc_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIHTC_REQUIRED_DOCS.map((d) => (
                      <SelectItem key={d.key} value={d.key}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Label</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g., ACME Corp pay stub 2026-01-15"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Issued on</Label>
                  <Input
                    type="date"
                    value={form.issued_on}
                    onChange={(e) => setForm({ ...form, issued_on: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Expires on</Label>
                  <Input
                    type="date"
                    value={form.expires_on}
                    onChange={(e) => setForm({ ...form, expires_on: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Attach PDF (optional)</Label>
                {pdfName ? (
                  <div className="mt-1 flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    <span className="truncate">📄 {pdfName}</span>
                    <Button size="sm" variant="ghost" onClick={() => setPdfName(null)}>
                      <X className="h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>
                ) : (
                  <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
                    <Upload className="h-4 w-4" />
                    Choose PDF
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePdfPick(f);
                      }}
                    />
                  </label>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  For AI extraction of profile fields from a PDF, use the Profile page — those uploads are also saved here.
                </p>
              </div>
              <div>
                <Label>Content / notes</Label>
                <Textarea
                  rows={3}
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="Paste the text or write a short summary. Used by RenterCompanion to extract profile fields."
                />
              </div>
              <Button onClick={() => add.mutate()} disabled={add.isPending} className="w-full">
                <Plus className="h-4 w-4" /> Add document
              </Button>
            </div>
          </Card>
        </div>

        <h2 className="mt-8 text-sm font-semibold">Saved documents</h2>
        {docs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {docs.map((d) => (
              <li key={d.id}>
                <Card className="flex items-start gap-3 p-4">
                  <FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium">{d.label}</div>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {d.doc_type}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {d.issued_on ? `Issued ${d.issued_on}` : `Added ${new Date(d.created_at).toLocaleDateString()}`}
                      {d.expires_on ? ` · Expires ${d.expires_on}` : ""}
                    </div>
                    {d.content && (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{d.content}</p>
                    )}
                  </div>
                  <Button size="icon-sm" variant="ghost" onClick={() => del.mutate(d.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
