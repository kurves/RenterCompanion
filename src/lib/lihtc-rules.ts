// Versioned LIHTC rule corpus. Single program (LIHTC), single metro
// (Boston-Cambridge-Newton, MA-NH HMFA), single rule year (2025).
// Every value has a source + effective date; unknown inputs must ABSTAIN.

export const RULE_YEAR = 2025 as const;
export const EFFECTIVE_DATE = "2025-04-01" as const;
export const CORPUS_VERSION = "lihtc-2025-04-boston-msa-v1" as const;
export const METRO_NAME = "Boston-Cambridge-Newton, MA-NH HMFA" as const;

export type IncomeLimitRow = {
  city: string;
  state: string;
  // 4-person 100% AMI baseline (HUD MTSP concept). Per-size limits are derived.
  ami_4person_usd: number;
  source_url: string;
};

// All cities in this corpus fall inside the Boston-Cambridge-Newton HMFA and
// therefore share the same MTSP 4-person 100% AMI figure. Replace with
// jurisdiction-specific rows for production.
const BOSTON_MSA_AMI_4P = 148300;
const HUD_MTSP_URL = "https://www.huduser.gov/portal/datasets/mtsp.html";

export const MTSP_2025: IncomeLimitRow[] = [
  "Boston",
  "Brookline",
  "Cambridge",
  "Chelsea",
  "Everett",
  "Malden",
  "Quincy",
  "Somerville",
].map((city) => ({
  city,
  state: "MA",
  ami_4person_usd: BOSTON_MSA_AMI_4P,
  source_url: HUD_MTSP_URL,
}));

// HUD MTSP household-size adjustment factors relative to the 4-person figure.
const SIZE_FACTORS: Record<number, number> = {
  1: 0.7,
  2: 0.8,
  3: 0.9,
  4: 1.0,
  5: 1.08,
  6: 1.16,
  7: 1.24,
  8: 1.32,
};

export type AmiSet = 50 | 60 | 80;

export function findMtspRow(city: string, state: string): IncomeLimitRow | null {
  const c = city.trim().toLowerCase();
  const s = state.trim().toUpperCase();
  return MTSP_2025.find((r) => r.city.toLowerCase() === c && r.state === s) ?? null;
}

export type LimitComputation = {
  status: "ok" | "abstain";
  reason?: string;
  household_size?: number;
  ami_set?: AmiSet;
  ami_4person_usd?: number;
  size_factor?: number;
  limit_usd?: number;
  formula?: string;
  source_url?: string;
  effective_date?: string;
  corpus_version?: string;
  citations?: string[];
};

export function computeIncomeLimit(input: {
  city?: string | null;
  state?: string | null;
  household_size?: number | null;
  ami_set?: AmiSet;
}): LimitComputation {
  const { city, state, household_size } = input;
  const ami_set = input.ami_set ?? 60;

  if (!city || !state) {
    return {
      status: "abstain",
      reason: "City and 2-letter state are required to look up an income limit.",
    };
  }
  if (!household_size || household_size < 1) {
    return { status: "abstain", reason: "Household size is required." };
  }
  const factor = SIZE_FACTORS[Math.min(Math.max(household_size, 1), 8)];
  if (!factor) {
    return { status: "abstain", reason: "Household size out of range (1–8)." };
  }
  const row = findMtspRow(city, state);
  if (!row) {
    return {
      status: "abstain",
      reason: `No entry in the ${RULE_YEAR} ${METRO_NAME} corpus for ${city}, ${state}. RenterCompanion abstains rather than guess.`,
    };
  }
  const at100 = row.ami_4person_usd * factor;
  const limit = Math.round((at100 * ami_set) / 100);
  return {
    status: "ok",
    household_size,
    ami_set,
    ami_4person_usd: row.ami_4person_usd,
    size_factor: factor,
    limit_usd: limit,
    formula: `round(ami_4person × size_factor(${household_size}) × ${ami_set}% ) = round(${row.ami_4person_usd} × ${factor} × ${ami_set / 100}) = $${limit.toLocaleString()}`,
    source_url: row.source_url,
    effective_date: EFFECTIVE_DATE,
    corpus_version: CORPUS_VERSION,
    citations: ["hudil", "irc42"],
  };
}

export type FitAssessment =
  | { status: "abstain"; reason: string }
  | {
      status: "under_limit" | "over_limit";
      confirmed_income_usd: number;
      limit: LimitComputation & { status: "ok" };
      margin_usd: number;
      disclaimer: string;
    };

export function assessFit(input: {
  confirmed_income_usd?: number | null;
  income_confirmed_at?: string | null;
  city?: string | null;
  state?: string | null;
  household_size?: number | null;
  ami_set?: AmiSet;
}): FitAssessment {
  if (input.confirmed_income_usd == null || Number.isNaN(input.confirmed_income_usd)) {
    return { status: "abstain", reason: "No confirmed annual income on the profile yet." };
  }
  if (!input.income_confirmed_at) {
    return {
      status: "abstain",
      reason: "Income value is a draft. Confirm it on the Profile page before comparing to a limit.",
    };
  }
  const limit = computeIncomeLimit(input);
  if (limit.status !== "ok") return { status: "abstain", reason: limit.reason ?? "Unknown." };
  const okLimit = limit as LimitComputation & { status: "ok"; limit_usd: number };
  const margin = okLimit.limit_usd - input.confirmed_income_usd;
  return {
    status: margin >= 0 ? "under_limit" : "over_limit",
    confirmed_income_usd: input.confirmed_income_usd,
    limit: okLimit,
    margin_usd: margin,
    disclaimer:
      "RenterCompanion compares your reported income to the published limit. It does NOT decide eligibility — only a property's compliance staff can.",
  };
}
