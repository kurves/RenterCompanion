import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import {
  MessageSquarePlus,
  User,
  FileText,
  ClipboardCheck,
  BookOpen,
  LogOut,
  Loader2,
  Trash2,
  ShieldCheck,
  MapPin,
  Info,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listThreads,
  createThread,
  deleteThread,
} from "@/lib/copilot.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/logo.png.asset.json";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const router = useRouterState();
  const path = router.location.pathname;

  const { data: threads = [], isLoading } = useQuery({
    queryKey: ["threads"],
    queryFn: () => listThreads(),
  });

  const createMut = useMutation({
    mutationFn: () => createThread({ data: {} }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/chat/$threadId", params: { threadId: t.id } });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteThread({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["threads"] }),
  });

  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    qc.clear();
    navigate({ to: "/auth" });
  }

  const navItems = [
    { to: "/profile", label: "1. Profile", icon: User },
    { to: "/understand", label: "2. Understand", icon: BookOpen },
    { to: "/documents", label: "Documents", icon: FileText },
    { to: "/packet", label: "3. Packet", icon: ClipboardCheck },
    { to: "/discover", label: "Discover", icon: MapPin },
    { to: "/trust", label: "Trust & controls", icon: ShieldCheck },
    { to: "/about", label: "Architecture & risk", icon: Info },
  ] as const;

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3 px-4 py-4 border-b">
          <img src={logoAsset.url} alt="" width={36} height={36} className="rounded" />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">RenterCompanion</div>
            <div className="text-xs text-muted-foreground">LIHTC readiness</div>
          </div>
        </div>

        <div className="p-3">
          <Button
            className="w-full justify-start"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
          >
            {createMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquarePlus className="h-4 w-4" />
            )}
            New conversation
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Conversations
          </div>
          {isLoading ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">Loading…</div>
          ) : threads.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">No conversations yet.</div>
          ) : (
            <ul className="space-y-0.5">
              {threads.map((t) => {
                const active = path === `/chat/${t.id}`;
                return (
                  <li key={t.id} className="flex items-center">
                    <Link
                      to="/chat/$threadId"
                      params={{ threadId: t.id }}
                      className={cn(
                        "flex-1 truncate rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent",
                        active && "bg-sidebar-accent font-medium",
                      )}
                    >
                      {t.title}
                    </Link>
                    <button
                      aria-label="Delete conversation"
                      className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        if (confirm("Delete this conversation?")) deleteMut.mutate(t.id);
                        if (active) navigate({ to: "/chat" });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t p-2 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent",
                path === to && "bg-sidebar-accent font-medium",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          <button
            onClick={signOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
