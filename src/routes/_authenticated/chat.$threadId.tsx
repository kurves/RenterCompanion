import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { LIHTC_CITATIONS } from "@/lib/lihtc-knowledge";
import { listMessages, saveProfile } from "@/lib/copilot.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, X, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import logoAsset from "@/assets/logo.png.asset.json";
const logo = logoAsset.url;

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = useParams({ from: "/_authenticated/chat/$threadId" });
  const qc = useQueryClient();

  const { data: initialMessages, isLoading } = useQuery({
    queryKey: ["messages", threadId],
    queryFn: () => listMessages({ data: { threadId } }),
  });

  if (isLoading || !initialMessages) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading conversation…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ChatInner
        key={threadId}
        threadId={threadId}
        initialMessages={initialMessages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          parts: m.parts as UIMessage["parts"],
        }))}
        onAssistantDone={() => qc.invalidateQueries({ queryKey: ["messages", threadId] })}
      />
    </AppShell>
  );
}

function ChatInner({
  threadId,
  initialMessages,
  onAssistantDone,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  onAssistantDone: () => void;
}) {
  const [input, setInput] = useState("");
  const focusRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        fetch: async (input, init) => {
          const { data } = await supabase.auth.getSession();
          const headers = new Headers(init?.headers);
          if (data.session?.access_token) {
            headers.set("Authorization", `Bearer ${data.session.access_token}`);
          }
          return fetch(input, { ...init, headers });
        },
        prepareSendMessagesRequest: ({ messages, id }) => ({
          body: { messages, id },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, error } = useChat<UIMessage>({
    id: threadId,
    messages: initialMessages,
    transport,
    onFinish: onAssistantDone,
    onError: (e) => toast.error(e.message ?? "Something went wrong"),
  });

  useEffect(() => {
    focusRef.current?.focus();
  }, [threadId, status]);

  const busy = status === "submitted" || status === "streaming";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-6 py-3">
        <MessageCircle className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-medium">LIHTC readiness conversation</div>
      </div>

      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<img src={logo} alt="" width={40} height={40} className="rounded-lg" />}
              title="Tell me about your household"
              description="I'll help you build a confirmed profile, cite the LIHTC rules that apply, and flag any missing documents. I don't decide eligibility."
            />
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
          {status === "submitted" && (
            <div className="pl-2 pt-2">
              <Shimmer>Thinking…</Shimmer>
            </div>
          )}
          {error && (
            <div className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error.message}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <PromptInput
          onSubmit={(msg) => {
            const text = msg.text.trim();
            if (!text || busy) return;
            sendMessage({ text });
            setInput("");
          }}
        >
          <PromptInputTextarea
            ref={focusRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about LIHTC rules, share income info, or ask what documents you need…"
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={!input.trim() || busy} />
          </PromptInputFooter>
        </PromptInput>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          I don't decide eligibility. That's up to the property's compliance staff.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const from = message.role === "user" ? "user" : "assistant";
  return (
    <Message from={from}>
      <MessageContent className={from === "assistant" ? "bg-transparent p-0" : undefined}>
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return <MessageResponse key={i}>{decorateCitations(part.text)}</MessageResponse>;
          }
          if (part.type?.startsWith("tool-")) {
            return <ToolPart key={i} part={part as ToolUIPart} />;
          }
          return null;
        })}
      </MessageContent>
    </Message>
  );
}

type ToolUIPart = {
  type: string;
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function ToolPart({ part }: { part: ToolUIPart }) {
  const toolName = part.type.replace(/^tool-/, "");
  const isProfileDraft =
    toolName === "update_profile_draft" && part.state === "output-available";
  return (
    <div className="mt-2 w-full">
      <Tool defaultOpen={false}>
        <ToolHeader type={part.type as `tool-${string}`} state={part.state} />
        <ToolContent>
          <ToolInput input={part.input} />
          <ToolOutput output={<pre className="whitespace-pre-wrap text-xs">{JSON.stringify(part.output, null, 2)}</pre>} errorText={part.errorText} />
        </ToolContent>
      </Tool>
      {isProfileDraft && <ProfileDraftCard output={part.output as ProfileDraftOutput} />}
    </div>
  );
}

type ProfileDraftOutput = {
  status: string;
  rationale: string;
  draft: Record<string, unknown>;
};

function ProfileDraftCard({ output }: { output: ProfileDraftOutput }) {
  const [decided, setDecided] = useState<"confirmed" | "dismissed" | null>(null);
  const qc = useQueryClient();
  async function confirm() {
    await saveProfile({ data: { data: output.draft, confirm: true } });
    setDecided("confirmed");
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Profile updated");
  }
  return (
    <Card className="mt-2 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
          Proposed profile update
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{output.rationale}</p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">
        {JSON.stringify(output.draft, null, 2)}
      </pre>
      {decided ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {decided === "confirmed" ? "Saved to your profile." : "Dismissed — nothing was saved."}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={confirm}>
            <Check className="h-4 w-4" /> Confirm and save
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDecided("dismissed")}>
            <X className="h-4 w-4" /> Not right
          </Button>
        </div>
      )}
    </Card>
  );
}

// Replace [citekey] mentions with markdown links to the citation URL.
function decorateCitations(text: string): string {
  return text.replace(/\[([a-z0-9]+)\]/gi, (m, key) => {
    const c = LIHTC_CITATIONS[key.toLowerCase()];
    if (!c) return m;
    return `[[${c.label}]](${c.url})`;
  });
}
