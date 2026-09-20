// Header-text based column dictionary — NOT positional. Handles the State's own
// daily format and DAHD's consolidated multi-State format (minor renaming/reordering
// still resolves correctly).

export const FIELD_DICTIONARY: Record<string, string[]> = {
  stateRaw: ["state", "state/ut", "state / ut", "state name"],
  diseaseRaw: ["disease", "disease name"],
  speciesRaw: ["species", "species affected", "animal species"],
  districtRaw: ["district"],
  village: ["village", "epicentre", "place of occurrence", "epicenter"],
  block: ["block", "tehsil", "taluka"],
  probableCases: ["probable", "clinically infected", "probable/clinically infected", "probable cases"],
  labConfirmed: ["lab confirmed", "confirmed", "laboratory confirmed"],
  deathsToday: ["deaths that day", "deaths today", "deaths"],
  cumulativeCases: ["cumulative cases", "cumulative cases since 1 jan", "cum cases", "total cumulative cases"],
  activeCases: ["active cases", "active cases as on date", "active"],
  cumulativeDeaths: ["cumulative deaths", "cumulative deaths since 1 jan", "cum deaths"],
  recoveredCumulative: ["recovered", "recovered animals", "recovered cumulative", "recovered animals cumulative"],
  vaccinationCumulative: ["vaccination", "vaccination since 1 jan", "vaccinated"],
  culledCount: ["culled", "slaughtered", "culled/slaughtered", "animals culled/slaughtered"],
  controlMeasures: ["control measures", "control measures undertaken", "measures taken"],
  remarks: ["remarks", "remark", "notes"],
};

function norm(s: string): string {
  return s.toString().trim().toLowerCase().replace(/\s+/g, " ");
}

export interface ColumnMapResult {
  mapping: Record<string, number>; // field -> column index
  unmatchedColumns: { index: number; header: string }[];
  confidence: "HIGH" | "LOW";
}

export function mapColumns(headerRow: (string | undefined)[]): ColumnMapResult {
  const mapping: Record<string, number> = {};
  const unmatchedColumns: { index: number; header: string }[] = [];

  // For each header, find the single BEST match across the whole dictionary —
  // exact match wins outright; otherwise the longest (most specific) substring
  // variant wins, so a generic word like "deaths" cannot swallow a more specific
  // column such as "Cumulative deaths since 1 Jan" ahead of its own field.
  function bestFieldFor(h: string): string | null {
    let best: { field: string; len: number; exact: boolean } | null = null;
    for (const [field, variants] of Object.entries(FIELD_DICTIONARY)) {
      for (const v of variants) {
        const exact = h === v;
        const partial = !exact && h.includes(v);
        if (!exact && !partial) continue;
        const len = v.length;
        if (!best || exact && !best.exact || (exact === best.exact && len > best.len)) {
          best = { field, len, exact };
        }
      }
    }
    return best?.field ?? null;
  }

  headerRow.forEach((raw, idx) => {
    if (!raw) return;
    const h = norm(raw);
    const matchedField = bestFieldFor(h);
    if (matchedField && mapping[matchedField] === undefined) {
      mapping[matchedField] = idx;
    } else {
      unmatchedColumns.push({ index: idx, header: raw });
    }
  });

  const requiredCore = ["stateRaw", "diseaseRaw", "probableCases", "labConfirmed"];
  const matchedCore = requiredCore.filter((f) => mapping[f] !== undefined).length;
  const confidence: "HIGH" | "LOW" = matchedCore >= 3 ? "HIGH" : "LOW";

  return { mapping, unmatchedColumns, confidence };
}

export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
