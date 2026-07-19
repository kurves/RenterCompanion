import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createThread } from "@/lib/copilot.functions";
import { MessageSquarePlus, ShieldCheck } from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";
const logo = logoAsset.url;

export const Route = createFileRoute("/_authenticated/chat/")({
  component: ChatLanding,
});

function ChatLanding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (title?: string) => createThread({ data: { title } }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/chat/$threadId", params: { threadId: t.id } });
    },
  });

  const starters = [
    "Help me build my household profile from my most recent pay stub.",
    "What LIHTC documents am I missing?",
    "Explain the LIHTC student rule in plain language.",
    "Generate a readiness packet from what you have so far.",
  ];

  return (
    <AppShell>
      <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-6 py-10">
        <img src={logo} alt="" width={64} height={64} className="mb-4 rounded-xl" />
        <h1 className="text-3xl font-semibold tracking-tight">RenterCompanion</h1>
        <p className="mt-2 max-w-xl text-center text-muted-foreground">
          I help you build a household profile, explain LIHTC rules with citations, and flag
          missing or expired documents — so you can show up to any property with a ready packet.
        </p>

        <Card className="mt-6 flex items-start gap-3 p-4 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            I don't decide eligibility. Only a property's compliance staff can certify a household
            for a LIHTC unit. Everything here is a plain-language explanation with citations.
          </div>
        </Card>

        <div className="mt-6 w-full rounded-lg border bg-muted/30 p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Design principle
          </div>
          <p className="mt-1 text-sm">
            The AI extracts, explains, retrieves, calculates, and prepares.{" "}
            <span className="font-medium text-foreground">The renter confirms.</span>{" "}
            <span className="font-medium text-foreground">A qualified human decides.</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[
              ["One metro", "Keep the context local"],
              ["One program", "Freeze the rules"],
              ["Synthetic docs", "Protect real renters"],
              ["Human decision", "No gatekeeping"],
            ].map(([title, sub]) => (
              <div key={title} className="rounded-md border bg-card p-2">
                <div className="font-medium">{title}</div>
                <div className="text-muted-foreground">{sub}</div>
              </div>
            ))}
          </div>
        </div>


        <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
          {starters.map((s) => (
            <button
              key={s}
              className="rounded-lg border bg-card p-3 text-left text-sm hover:bg-accent"
              onClick={() => mut.mutate(s.slice(0, 60))}
              disabled={mut.isPending}
            >
              {s}
            </button>
          ))}
        </div>

        <Button className="mt-6" onClick={() => mut.mutate(undefined)} disabled={mut.isPending}>
          <MessageSquarePlus className="h-4 w-4" />
          Start a new conversation
        </Button>
      </div>
    </AppShell>
  );
}
