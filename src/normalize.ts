// normalize.ts
// A priori normalize contract for trace equivalence testing.
//
// Purpose: define EXACTLY which fields are stripped before comparing two traces.
// This contract must be defined BEFORE any trace comparison is run — not
// discovered post-hoc by stripping fields until traces match.
//
// Rule: a field may only be in this whitelist if it satisfies BOTH conditions:
//   (1) it carries legitimate per-run variance (not a semantic difference)
//   (2) its variance is caused by the execution environment, not by logic
//
// Caution: if traces differ AFTER normalization, the difference is real.
//   DO NOT add fields to this list to make a diff disappear.

export interface NormalizeField {
  /** Field name as it appears in LoopEvent objects */
  field: string
  /** Why this field is legitimately non-deterministic across runs */
  rationale: string
}

/**
 * Fields stripped from each event before trace comparison.
 * These are the ONLY fields allowed to differ across runs of the same scenario.
 *
 * Every other field difference is a real semantic difference and must not be masked.
 */
export const NORMALIZE_WHITELIST: readonly NormalizeField[] = [
  {
    field: "event_id",
    rationale: "UUID generated per-event via crypto.randomUUID(). Unique by design. Not comparable across runs.",
  },
  {
    field: "run_id",
    rationale: "UUID generated once per runGovernedLoop() call. Changes each run. Carried in attempt_id prefix.",
  },
  {
    field: "attempt_id",
    rationale: "Formatted as '<run_id>-a<N>'. Inherits run_id variance. Only the attempt number is meaningful for comparison.",
  },
  {
    field: "timestamp",
    rationale: "ISO 8601 wall-clock time. Legitimately differs across runs by definition.",
  },
  {
    field: "duration_ms",
    rationale: "Elapsed wall-clock milliseconds since attempt start. Legitimately differs across runs by definition.",
  },
] as const

/** Field names only — for use in normalization functions */
export const NORMALIZE_FIELDS: ReadonlySet<string> = new Set(
  NORMALIZE_WHITELIST.map((f) => f.field)
)

/**
 * Strip volatile fields from a single event.
 * Removes NORMALIZE_WHITELIST fields and replaces parent_event_id UUID with
 * a parent index for structural comparison.
 *
 * This is layer 1 of trace canonicalization.
 * Layer 2 (structural normalization) is policy-core's normalizeTrace().
 * DO NOT use this function directly for trace comparison — use assertTraceEquivalence().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stripVolatileField(event: Record<string, any>, index: number, all: Record<string, any>[]): Record<string, unknown> {
  void index  // index not used in this implementation, but kept for API symmetry
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(event)) {
    if (NORMALIZE_FIELDS.has(k)) continue
    if (k === "parent_event_id") {
      // Replace UUID reference with position index for structural comparison
      const parentIndex = all.findIndex((e) => e["event_id"] === v)
      out["parent_index"] = parentIndex >= 0 ? parentIndex : -1
      continue
    }
    out[k] = v
  }
  return out
}

/**
 * Strip volatile fields from all events in a trace.
 * This is layer 1 of canonicalization. Output is suitable for passing to
 * policy-core's normalizeTrace() for structural comparison.
 *
 * DO NOT use this function directly for trace comparison — use assertTraceEquivalence().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stripVolatileFields(events: Record<string, any>[]): Record<string, unknown>[] {
  return events.map((e, i) => stripVolatileField(e, i, events))
}
