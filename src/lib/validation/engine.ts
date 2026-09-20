// ============================================================================
// SHARED VALIDATION ENGINE
// Used identically by: manual entry (live, on blur + on submit) and bulk
// upload (pre-commit review). No submission path may bypass this module.
// ============================================================================

export type Severity = "BLOCK" | "WARNING";

export interface ValidationIssue {
  field: string; // exact field name
  rule: string; // plain-language rule
  valueReceived: string; // as string, for display
  expected: string; // expected relationship/value
  severity: Severity;
  cellRef?: string; // for bulk upload traceability
}

export interface LineInput {
  // resolved-or-raw identity fields
  stateCode?: string;
  diseaseCode?: string; // may be free text pre-resolution
  diseaseRaw?: string;
  speciesCodes?: string[]; // resolved species codes
  speciesRaw?: string[];
  districtName?: string;

  // numeric fields — string because "NIL" is a valid raw value
  probableCases: string | number;
  labConfirmed: string | number;
  deathsToday: string | number;
  cumulativeCases: string | number;
  activeCases: string | number;
  cumulativeDeaths: string | number;
  recoveredCumulative: string | number;
  vaccinationCumulative?: string | number | null;
  culledCount?: string | number | null;

  controlMeasures?: string | null;
  remarks?: string | null;

  isNil?: boolean;

  // decrease acknowledgement
  decreaseReason?: string | null;

  cellRefs?: Partial<Record<string, string>>; // field -> "B12" for bulk upload
}

export interface PriorDayContext {
  cumulativeCases: number;
  cumulativeDeaths: number;
}

export interface MasterDataLookup {
  states: { code: string; name: string }[];
  diseases: { code: string; name: string; isCatchAll: boolean }[];
  species: { code: string; name: string }[];
}

export interface RowValidationResult {
  status: "ACCEPTED" | "ACCEPTED_WARNING" | "REJECTED";
  issues: ValidationIssue[];
  normalized: {
    probableCases: number;
    labConfirmed: number;
    totalCasesToday: number;
    deathsToday: number;
    cumulativeCases: number;
    activeCases: number;
    cumulativeDeaths: number;
    recoveredCumulative: number;
    vaccinationCumulative: number | null;
    culledCount: number | null;
  } | null;
  uploadNotes?: string;
}

const NUMERIC_FIELDS = [
  "probableCases",
  "labConfirmed",
  "deathsToday",
  "cumulativeCases",
  "activeCases",
  "cumulativeDeaths",
  "recoveredCumulative",
] as const;

const OPTIONAL_NUMERIC_FIELDS = ["vaccinationCumulative", "culledCount"] as const;

const FIELD_LABELS: Record<string, string> = {
  probableCases: "Probable/Clinically Infected",
  labConfirmed: "Lab Confirmed",
  totalCasesToday: "Total cases that day",
  deathsToday: "Deaths that day",
  cumulativeCases: "Cumulative cases since 1 Jan",
  activeCases: "Active cases as on date",
  cumulativeDeaths: "Cumulative deaths since 1 Jan",
  recoveredCumulative: "Recovered animals cumulative",
  vaccinationCumulative: "Vaccination since 1 Jan",
  culledCount: "Animals culled/slaughtered",
  disease: "Disease",
  state: "State/UT",
  species: "Species",
};

/** Parses a numeric cell, treating "NIL" (any case, trimmed) as 0. Returns null if unparseable. */
export function parseNumericOrNil(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  const trimmed = value.toString().trim();
  if (trimmed.toUpperCase() === "NIL") return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = parseInt(trimmed, 10);
  return n >= 0 ? n : null;
}

/** Simple case-insensitive Levenshtein-based fuzzy match against a master list. */
export function fuzzyMatch(
  input: string,
  candidates: { code: string; name: string }[]
): { match: { code: string; name: string } | null; suggestions: { code: string; name: string }[] } {
  const norm = (s: string) => s.trim().toLowerCase();
  const target = norm(input);

  const exact = candidates.find((c) => norm(c.name) === target || norm(c.code) === target);
  if (exact) return { match: exact, suggestions: [] };

  function levenshtein(a: string, b: string): number {
    const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[a.length][b.length];
  }

  const scored = candidates
    .map((c) => ({ c, dist: levenshtein(target, norm(c.name)) }))
    .sort((a, b) => a.dist - b.dist);

  const best = scored[0];
  const threshold = Math.max(2, Math.floor(target.length * 0.3));
  if (best && best.dist <= threshold) {
    // High confidence auto-accept only for very close (<=1) matches; else suggest.
    if (best.dist <= 1) return { match: best.c, suggestions: [] };
    return { match: null, suggestions: scored.slice(0, 3).map((s) => s.c) };
  }
  return { match: null, suggestions: scored.slice(0, 3).map((s) => s.c) };
}

export interface ValidateRowOptions {
  prior?: PriorDayContext | null; // yesterday's cumulative figures for this State+Disease
  allowDecreaseWithoutReason?: boolean; // false by default -> WARNING requires reason
}

/**
 * Core row-level validation. Operates purely on already-identity-resolved input
 * (State/Disease/Species matched to master data by caller) plus the numeric/text
 * fields. This function is called identically from the manual-entry API route
 * and from the bulk-upload commit pipeline.
 */
export function validateLine(input: LineInput, opts: ValidateRowOptions = {}): RowValidationResult {
  const issues: ValidationIssue[] = [];
  const cell = (f: string) => input.cellRefs?.[f];

  // --- NIL short-circuit: a NIL row still needs the shape to be sane, but all-zero is valid.
  if (input.isNil) {
    return {
      status: "ACCEPTED",
      issues: [],
      normalized: {
        probableCases: 0,
        labConfirmed: 0,
        totalCasesToday: 0,
        deathsToday: 0,
        cumulativeCases: opts.prior?.cumulativeCases ?? 0,
        activeCases: 0,
        cumulativeDeaths: opts.prior?.cumulativeDeaths ?? 0,
        recoveredCumulative: 0,
        vaccinationCumulative: null,
        culledCount: null,
      },
    };
  }

  // --- Structural: required numeric fields present & valid integer or NIL
  const parsed: Record<string, number | null> = {};
  for (const f of NUMERIC_FIELDS) {
    const raw = input[f];
    const val = parseNumericOrNil(raw);
    parsed[f] = val;
    if (raw === null || raw === undefined || raw === "") {
      issues.push({
        field: f,
        rule: `${FIELD_LABELS[f]} cannot be blank on a submitted row. Enter a number or "NIL".`,
        valueReceived: "(blank)",
        expected: "integer ≥ 0 or NIL",
        severity: "BLOCK",
        cellRef: cell(f),
      });
    } else if (val === null) {
      issues.push({
        field: f,
        rule: `${FIELD_LABELS[f]} must be a whole number ≥ 0, or the text "NIL".`,
        valueReceived: String(raw),
        expected: "integer ≥ 0 or NIL",
        severity: "BLOCK",
        cellRef: cell(f),
      });
    }
  }

  for (const f of OPTIONAL_NUMERIC_FIELDS) {
    const raw = input[f];
    if (raw !== null && raw !== undefined && raw !== "") {
      const val = parseNumericOrNil(raw);
      parsed[f] = val;
      if (val === null) {
        issues.push({
          field: f,
          rule: `${FIELD_LABELS[f]} must be a whole number ≥ 0, or "NIL", when provided.`,
          valueReceived: String(raw),
          expected: "integer ≥ 0 or NIL",
          severity: "BLOCK",
          cellRef: cell(f),
        });
      }
    } else {
      parsed[f] = null;
    }
  }

  const hasBlockingStructural = issues.some((i) => i.severity === "BLOCK");
  if (hasBlockingStructural) {
    return { status: "REJECTED", issues, normalized: null };
  }

  const probableCases = parsed.probableCases!;
  const labConfirmed = parsed.labConfirmed!;
  const totalCasesToday = probableCases + labConfirmed;
  const deathsToday = parsed.deathsToday!;
  const cumulativeCases = parsed.cumulativeCases!;
  const activeCases = parsed.activeCases!;
  const cumulativeDeaths = parsed.cumulativeDeaths!;
  const recoveredCumulative = parsed.recoveredCumulative!;

  // --- Cross-field arithmetic (hard blocks) ---

  // Recovered = Cumulative cases − Active cases − Cumulative deaths
  const expectedRecovered = cumulativeCases - activeCases - cumulativeDeaths;
  if (recoveredCumulative !== expectedRecovered) {
    issues.push({
      field: "recoveredCumulative",
      rule: "Recovered animals cumulative must equal Cumulative cases minus Active cases minus Cumulative deaths.",
      valueReceived: String(recoveredCumulative),
      expected: `${expectedRecovered} (= ${cumulativeCases} − ${activeCases} − ${cumulativeDeaths})`,
      severity: "BLOCK",
      cellRef: cell("recoveredCumulative"),
    });
  }

  // Active cases ≤ Cumulative cases
  if (activeCases > cumulativeCases) {
    issues.push({
      field: "activeCases",
      rule: "Active cases as on date cannot exceed Cumulative cases since 1 Jan.",
      valueReceived: String(activeCases),
      expected: `≤ ${cumulativeCases}`,
      severity: "BLOCK",
      cellRef: cell("activeCases"),
    });
  }

  // Cumulative deaths ≤ Cumulative cases
  if (cumulativeDeaths > cumulativeCases) {
    issues.push({
      field: "cumulativeDeaths",
      rule: "Cumulative deaths since 1 Jan cannot exceed Cumulative cases since 1 Jan.",
      valueReceived: String(cumulativeDeaths),
      expected: `≤ ${cumulativeCases}`,
      severity: "BLOCK",
      cellRef: cell("cumulativeDeaths"),
    });
  }

  // A single day's new cases must not exceed the entire cumulative-since-1-Jan figure
  if (totalCasesToday > cumulativeCases) {
    issues.push({
      field: "totalCasesToday",
      rule: "A single day's new cases cannot exceed the entire cumulative-since-1-Jan figure.",
      valueReceived: String(totalCasesToday),
      expected: `≤ ${cumulativeCases}`,
      severity: "BLOCK",
      cellRef: cell("probableCases"),
    });
  }

  // --- Cumulative must be non-decreasing vs prior day (WARNING, needs reason) ---
  if (opts.prior) {
    if (cumulativeCases < opts.prior.cumulativeCases) {
      if (!input.decreaseReason || !input.decreaseReason.trim()) {
        issues.push({
          field: "cumulativeCases",
          rule: "Cumulative cases since 1 Jan has decreased from yesterday's reported value. A one-line reason is required to save a decrease.",
          valueReceived: String(cumulativeCases),
          expected: `≥ ${opts.prior.cumulativeCases} (yesterday's value), or provide a reason`,
          severity: "WARNING",
          cellRef: cell("cumulativeCases"),
        });
      }
    }
    if (cumulativeDeaths < opts.prior.cumulativeDeaths) {
      if (!input.decreaseReason || !input.decreaseReason.trim()) {
        issues.push({
          field: "cumulativeDeaths",
          rule: "Cumulative deaths since 1 Jan has decreased from yesterday's reported value. A one-line reason is required to save a decrease.",
          valueReceived: String(cumulativeDeaths),
          expected: `≥ ${opts.prior.cumulativeDeaths} (yesterday's value), or provide a reason`,
          severity: "WARNING",
          cellRef: cell("cumulativeDeaths"),
        });
      }
    }
  }

  const hasBlock = issues.some((i) => i.severity === "BLOCK");
  const hasWarning = issues.some((i) => i.severity === "WARNING");

  if (hasBlock) {
    return { status: "REJECTED", issues, normalized: null };
  }

  return {
    status: hasWarning ? "ACCEPTED_WARNING" : "ACCEPTED",
    issues,
    normalized: {
      probableCases,
      labConfirmed,
      totalCasesToday,
      deathsToday,
      cumulativeCases,
      activeCases,
      cumulativeDeaths,
      recoveredCumulative,
      vaccinationCumulative: parsed.vaccinationCumulative ?? null,
      culledCount: parsed.culledCount ?? null,
    },
  };
}

// --- Soft statistical alerts (informational only, never block) ---

export interface SoftAlertContext {
  trailing7dayAvgNewCases: number; // for this State+Disease
  isFirstOccurrenceInState: boolean;
  isFirstOccurrenceInDistrict: boolean;
  adjacentStatesReportingSameDiseaseRecently: string[]; // state names/codes
}

export interface SoftAlert {
  type: "SPIKE" | "NEW_IN_STATE" | "NEW_IN_DISTRICT" | "REGIONAL_CLUSTER";
  message: string;
}

export function computeSoftAlerts(totalCasesToday: number, ctx: SoftAlertContext): SoftAlert[] {
  const alerts: SoftAlert[] = [];
  if (ctx.trailing7dayAvgNewCases > 0 && totalCasesToday > 3 * ctx.trailing7dayAvgNewCases) {
    alerts.push({
      type: "SPIKE",
      message: `New cases today (${totalCasesToday}) are more than 3× the trailing 7-day average (${ctx.trailing7dayAvgNewCases.toFixed(
        1
      )}).`,
    });
  }
  if (ctx.isFirstOccurrenceInState) {
    alerts.push({ type: "NEW_IN_STATE", message: "This disease is being reported in this State/UT for the first time." });
  } else if (ctx.isFirstOccurrenceInDistrict) {
    alerts.push({ type: "NEW_IN_DISTRICT", message: "This disease is being reported in this district for the first time." });
  }
  if (ctx.adjacentStatesReportingSameDiseaseRecently.length >= 2) {
    alerts.push({
      type: "REGIONAL_CLUSTER",
      message: `${ctx.adjacentStatesReportingSameDiseaseRecently.length} neighbouring States have also reported new cases of this disease in the last 7 days.`,
    });
  }
  return alerts;
}
