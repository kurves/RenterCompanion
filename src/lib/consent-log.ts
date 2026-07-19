// Client-side consent & action log. Records actions and rule versions —
// NEVER raw document contents. Backed by localStorage so it stays on-device
// and is wiped when the renter runs "Delete all my session data".

import { CORPUS_VERSION } from "@/lib/lihtc-rules";

const KEY = "rc.consent-log.v1";
const MAX = 500;

export type ConsentAction =
  | "profile.confirm"
  | "profile.field.accept"
  | "profile.field.reject"
  | "profile.field.correct"
  | "document.upload"
  | "document.delete"
  | "extract.pdf"
  | "extract.text"
  | "packet.generate"
  | "packet.download"
  | "packet.delete"
  | "session.delete-all"
  | "safety.refusal-test"
  | "safety.injection-test"
  | "safety.deletion-test"
  | "consent.grant"
  | "discover.filter";

export type ConsentEntry = {
  ts: string;
  action: ConsentAction;
  detail?: string;
  rule_version: string;
};

export function logAction(action: ConsentAction, detail?: string) {
  if (typeof window === "undefined") return;
  try {
    const list = readLog();
    list.unshift({
      ts: new Date().toISOString(),
      action,
      detail: detail?.slice(0, 200),
      rule_version: CORPUS_VERSION,
    });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // ignore quota / storage errors
  }
}

export function readLog(): ConsentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ConsentEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearLog() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
