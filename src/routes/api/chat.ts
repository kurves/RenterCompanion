import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import {
  LIHTC_CITATIONS,
  LIHTC_REQUIRED_DOCS,
  LIHTC_SYSTEM_PROMPT,
} from "@/lib/lihtc-knowledge";

// Isomorphic-safe fetch that strips the opaque-key bearer for the new Supabase key format.
function stripBearer(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (
      (supabaseKey.startsWith("sb_publishable_") || supabaseKey.startsWith("sb_secret_")) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

async function getUserContext(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });
  const token = auth.slice(7);
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const client = createClient(url, key, {
    global: { fetch: stripBearer(key), headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new Response("Unauthorized", { status: 401 });
  return { supabase: client, userId: data.claims.sub as string };
}

type ChatBody = {
  messages: UIMessage[];
  id?: string; // threadId
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let ctx;
        try {
          ctx = await getUserContext(request);
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabase, userId } = ctx;

        const body = (await request.json()) as ChatBody;
        const threadId = body.id;
        if (!threadId) return new Response("Missing thread id", { status: 400 });

        // verify thread ownership
        const { data: thread } = await supabase
          .from("threads")
          .select("id")
          .eq("id", threadId)
          .maybeSingle();
        if (!thread) return new Response("Thread not found", { status: 404 });

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const gateway = createLovableAiGatewayProvider(apiKey);

        // persist the latest user message once (id-based idempotency)
        const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
        if (lastUser) {
          await supabase.from("messages").upsert(
            {
              id: lastUser.id,
              thread_id: threadId,
              user_id: userId,
              role: "user",
              parts: lastUser.parts as never,
            },
            { onConflict: "id" },
          );
        }

        const tools = {
          extract_from_document: tool({
            description:
              "Fetch a stored document by id and return its text so you can propose profile fields. Use this before update_profile_draft.",
            inputSchema: z.object({
              document_id: z.string().uuid().describe("id of a document from the renter's library"),
            }),
            execute: async ({ document_id }) => {
              const { data, error } = await supabase
                .from("documents")
                .select("id, doc_type, label, content, issued_on, expires_on")
                .eq("id", document_id)
                .maybeSingle();
              if (error) return { error: error.message };
              if (!data) return { error: "not_found" };
              return data;
            },
          }),

          update_profile_draft: tool({
            description:
              "Propose an update to the household profile. The renter MUST confirm before it is saved — this tool only records the draft. Include only fields you are confident about, with a short human-readable rationale per field.",
            inputSchema: z.object({
              rationale: z.string().min(1),
              draft: z
                .object({
                  household_size: z.number().int().min(1).max(20).optional(),
                  members: z
                    .array(
                      z.object({
                        name: z.string(),
                        relationship: z.string(),
                        age: z.number().int().min(0).max(120).optional(),
                        is_full_time_student: z.boolean().optional(),
                      }),
                    )
                    .optional(),
                  annual_income_estimate_usd: z.number().min(0).optional(),
                  income_sources: z
                    .array(z.object({ source: z.string(), amount_usd: z.number(), frequency: z.string() }))
                    .optional(),
                  assets_total_usd: z.number().min(0).optional(),
                  city: z.string().optional(),
                  state: z.string().length(2).optional(),
                  notes: z.string().optional(),
                })
                .strict(),
            }),
            execute: async ({ rationale, draft }) => {
              // Return the draft to the UI; DO NOT write to household_profiles.
              // The renter confirms in the UI, which triggers the saveProfile serverFn.
              return { status: "awaiting_confirmation", rationale, draft };
            },
          }),

          check_readiness: tool({
            description:
              "Compare the renter's saved documents against the standard LIHTC document set and return a checklist (missing / expired / present).",
            inputSchema: z.object({}),
            execute: async () => {
              const { data: docs } = await supabase
                .from("documents")
                .select("doc_type, expires_on, created_at, label");
              const today = new Date();
              const items = LIHTC_REQUIRED_DOCS.map((req) => {
                const matches = (docs ?? []).filter((d) => d.doc_type === req.key);
                if (matches.length === 0) return { key: req.key, label: req.label, status: "missing", citation: req.citation };
                const stale = matches.every((d) => {
                  const anchor = d.expires_on ? new Date(d.expires_on) : new Date(d.created_at);
                  if (d.expires_on) return anchor < today;
                  const ageDays = (today.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24);
                  return ageDays > req.refresh_days;
                });
                return {
                  key: req.key,
                  label: req.label,
                  status: stale ? "expired" : "present",
                  citation: req.citation,
                };
              });
              return {
                items,
                summary: {
                  present: items.filter((i) => i.status === "present").length,
                  expired: items.filter((i) => i.status === "expired").length,
                  missing: items.filter((i) => i.status === "missing").length,
                },
                disclaimer:
                  "This checklist reflects the standard LIHTC tenant income certification document set. It does not decide eligibility.",
              };
            },
          }),

          explain_rule: tool({
            description:
              "Return a plain-language explanation for one LIHTC rule with the exact citation ids to cite.",
            inputSchema: z.object({
              topic: z.enum([
                "income_limits",
                "student_rule",
                "asset_income",
                "annual_income_calculation",
                "recertification",
                "unit_set_aside",
                "documentation_requirements",
              ]),
            }),
            execute: async ({ topic }) => {
              const rules: Record<string, { summary: string; citations: string[] }> = {
                income_limits: {
                  summary:
                    "LIHTC units are restricted to households whose income is at or below a set percentage of Area Median Income (typically 50% or 60% AMI). The exact dollar limits vary by city and household size and are published each year by HUD.",
                  citations: ["irc42", "hudil"],
                },
                student_rule: {
                  summary:
                    "A household made up entirely of full-time students is ineligible for a LIHTC unit unless it meets a specific exception (e.g., married and filing jointly, single parent with a minor child, receiving TANF, or in a job training program).",
                  citations: ["irc42", "hud43503"],
                },
                asset_income: {
                  summary:
                    "For households with total assets over $5,000, the owner counts the greater of (a) the actual income from those assets or (b) an imputed passbook rate applied to their cash value.",
                  citations: ["hud43503"],
                },
                annual_income_calculation: {
                  summary:
                    "Annual income is a projection: it is the anticipated income for the next 12 months from the effective date of certification, based on current, verified income sources.",
                  citations: ["hud43503"],
                },
                recertification: {
                  summary:
                    "Owners must reverify tenant income at initial move-in. Ongoing annual recertification requirements depend on whether the property is 100% LIHTC or mixed, and on state agency rules.",
                  citations: ["hud43503", "irc42"],
                },
                unit_set_aside: {
                  summary:
                    "Each LIHTC project irrevocably commits a set-aside election (e.g., 20/50, 40/60, or the newer average income test) determining what share of units are rent- and income-restricted.",
                  citations: ["irc42"],
                },
                documentation_requirements: {
                  summary:
                    "The renter typically provides government ID, SSN documentation for each member, pay stubs, third-party employment verification, benefit award letters, six months of bank statements, asset verifications, and a signed release form.",
                  citations: ["hud43503"],
                },
              };
              const entry = rules[topic];
              return {
                topic,
                summary: entry.summary,
                citations: entry.citations.map((id) => LIHTC_CITATIONS[id]),
                disclaimer:
                  "This is a plain-language summary — not legal advice. The property's compliance staff decides eligibility.",
              };
            },
          }),

          generate_packet: tool({
            description:
              "Create a renter-controlled application-readiness packet from the confirmed profile + documents. Returns a packet id the renter can share.",
            inputSchema: z.object({}),
            execute: async () => {
              const [profileRes, docsRes] = await Promise.all([
                supabase
                  .from("household_profiles")
                  .select("data, confirmed_at")
                  .eq("user_id", userId)
                  .maybeSingle(),
                supabase.from("documents").select("*"),
              ]);
              const docsList = docsRes.data ?? [];
              const today = new Date();
              const readiness = LIHTC_REQUIRED_DOCS.map((req) => {
                const matches = docsList.filter((d) => d.doc_type === req.key);
                if (matches.length === 0) return { key: req.key, label: req.label, status: "missing" };
                const stale = matches.every((d) => {
                  const anchor = d.expires_on ? new Date(d.expires_on) : new Date(d.created_at);
                  if (d.expires_on) return anchor < today;
                  const ageDays = (today.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24);
                  return ageDays > req.refresh_days;
                });
                return { key: req.key, label: req.label, status: stale ? "expired" : "present" };
              });
              const snapshot = {
                generated_at: new Date().toISOString(),
                program: "LIHTC",
                profile: profileRes.data?.data ?? {},
                profile_confirmed_at: profileRes.data?.confirmed_at ?? null,
                documents: docsList.map((d) => ({
                  id: d.id,
                  doc_type: d.doc_type,
                  label: d.label,
                  issued_on: d.issued_on,
                  expires_on: d.expires_on,
                })),
                readiness,
                disclaimer:
                  "This packet does not determine eligibility. Only the property's compliance staff can certify a household for a LIHTC unit.",
              };
              const { data, error } = await supabase
                .from("readiness_packets")
                .insert({ user_id: userId, snapshot: snapshot as never })
                .select("id, created_at")
                .single();
              if (error) return { error: error.message };
              return { packet_id: data.id, created_at: data.created_at, summary: snapshot };
            },
          }),
        };

        const result = streamText({
          model: gateway("google/gemini-2.5-flash"),
          system: LIHTC_SYSTEM_PROMPT,
          messages: await convertToModelMessages(body.messages),
          tools,
          stopWhen: stepCountIs(8),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages,
          onFinish: async ({ responseMessage }) => {
            try {
              await supabase.from("messages").upsert(
                {
                  id: responseMessage.id,
                  thread_id: threadId,
                  user_id: userId,
                  role: "assistant",
                  parts: responseMessage.parts as never,
                },
                { onConflict: "id" },
              );
              await supabase
                .from("threads")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", threadId);
            } catch (e) {
              console.error("[chat.onFinish]", e);
            }
          },
        });
      },
    },
  },
});
