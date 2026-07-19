import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deletePacket, generatePacket, listPackets } from "@/lib/copilot.functions";
import { ClipboardCheck, Download, Eye, EyeOff, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/packet")({
  component: PacketPage,
});

type ReadinessItem = { key: string; label: string; status: string };

type PacketSnapshot = {
  generated_at: string;
  program: string;
  profile: Record<string, unknown>;
  profile_confirmed_at: string | null;
  documents: Array<{
    id: string;
    doc_type: string;
    label: string;
    issued_on: string | null;
    expires_on: string | null;
  }>;
  readiness: ReadinessItem[];
  disclaimer: string;
};

function PacketPage() {
  const qc = useQueryClient();
  const { data: packets = [] } = useQuery({ queryKey: ["packets"], queryFn: () => listPackets() });
  const [openId, setOpenId] = useState<string | null>(null);

  const gen = useMutation({
    mutationFn: () => generatePacket(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packets"] });
      toast.success("Packet generated");
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => deletePacket({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packets"] });
      toast.success("Packet deleted");
    },
  });

  return (
    <AppShell>
      <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
        <div className="text-xs font-medium uppercase tracking-wide text-primary">Stage 03</div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Prepare — renter-controlled packet</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Snapshots of your confirmed profile and documents, flagged against the LIHTC gold
              checklist. Preview, download, or delete — nothing is ever sent to a property or
              provider on your behalf.
            </p>
          </div>
          <Button onClick={() => gen.mutate()} disabled={gen.isPending}>
            <ClipboardCheck className="h-4 w-4" />
            Generate packet
          </Button>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <div className="font-medium">You are the only one who shares this.</div>
            <div className="text-xs text-muted-foreground">
              RenterCompanion never auto-sends your profile or packet. You control every copy — hand
              it to a property manager yourself when you're ready.
            </div>
          </div>
        </div>

        {packets.length === 0 ? (
          <Card className="mt-6 p-6 text-sm text-muted-foreground">
            No packets yet. Generate one when your profile and documents feel ready.
          </Card>
        ) : (
          <ul className="mt-6 space-y-4">
            {packets.map((p) => {
              const snap = p.snapshot as unknown as PacketSnapshot;
              const open = openId === p.id;
              const missing = snap.readiness.filter((r) => r.status === "missing");
              const expired = snap.readiness.filter((r) => r.status === "expired");
              return (
                <li key={p.id}>
                  <Card className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">
                          Packet · {new Date(p.created_at).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Program: {snap.program}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setOpenId(open ? null : p.id)}
                        >
                          {open ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          {open ? "Hide" : "Preview"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadJson(`packet-${p.id.slice(0, 8)}.json`, snap)}
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm("Delete this packet? This cannot be undone.")) {
                              del.mutate(p.id);
                              if (open) setOpenId(null);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <ReadinessStat
                        label="Present"
                        n={snap.readiness.filter((r) => r.status === "present").length}
                        tone="ok"
                      />
                      <ReadinessStat label="Refresh" n={expired.length} tone="warn" />
                      <ReadinessStat label="Missing" n={missing.length} tone="mute" />
                    </div>

                    {open && (
                      <div className="mt-4 space-y-4 border-t pt-4">
                        <Section title="Confirmed profile">
                          {snap.profile_confirmed_at ? (
                            <>
                              <div className="text-xs text-muted-foreground">
                                Confirmed{" "}
                                {new Date(snap.profile_confirmed_at).toLocaleDateString()}
                              </div>
                              <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
                                {JSON.stringify(snap.profile, null, 2)}
                              </pre>
                            </>
                          ) : (
                            <div className="text-xs text-amber-700">
                              Profile was not confirmed when this packet was generated.
                            </div>
                          )}
                        </Section>
                        <Section title="Documents">
                          {snap.documents.length === 0 ? (
                            <div className="text-xs text-muted-foreground">None.</div>
                          ) : (
                            <ul className="space-y-1 text-xs">
                              {snap.documents.map((d) => (
                                <li key={d.id} className="flex justify-between gap-2 border-b py-1">
                                  <span>{d.label}</span>
                                  <span className="text-muted-foreground">
                                    {d.expires_on ? `exp ${d.expires_on}` : d.issued_on ?? "—"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </Section>
                        {(missing.length > 0 || expired.length > 0) && (
                          <Section title="Gaps against the gold checklist">
                            <ul className="space-y-1 text-xs">
                              {expired.map((r) => (
                                <li key={r.key} className="text-amber-700">
                                  ⟳ Refresh — {r.label}
                                </li>
                              ))}
                              {missing.map((r) => (
                                <li key={r.key} className="text-muted-foreground">
                                  ○ Missing — {r.label}
                                </li>
                              ))}
                            </ul>
                          </Section>
                        )}
                      </div>
                    )}

                    <p className="mt-4 text-xs text-muted-foreground">{snap.disclaimer}</p>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ReadinessStat({
  label,
  n,
  tone,
}: {
  label: string;
  n: number;
  tone: "ok" | "warn" | "mute";
}) {
  const bg =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-700"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-700"
        : "bg-muted text-muted-foreground";
  return (
    <div className={`rounded-md p-3 ${bg}`}>
      <div className="text-2xl font-semibold">{n}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
