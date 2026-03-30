// assert.ts
// assertTraceEquivalence — the ONLY legal entry point for trace comparison.
//
// Two-layer canonicalization (EM2 + P4a Single Entry Point):
//   Layer 1: policyNormalize (policy-core normalizeTrace)
//            → projects {type, status, attempt_id, parent_index}
//            → resolves parent_event_id UUID → parent_index using event_id
//   Layer 2: strip attempt_id from normalized output
//            → attempt_id = "<run_id>-a<N>" — contains run_id which is per-run volatile
//            → only the attempt number matters for structural comparison
//            → NORMALIZE_WHITELIST documents this rationale
//
// DO NOT compare traces using deepEqual directly on raw LoopEvent[].
// DO NOT call policyNormalize() or stripVolatileFields() directly for comparison.
// Only this function is the legal comparison entry point.
// Enforcement: check-trace-usage.mjs (B003a) + lint rule (B007).

import { normalizeTrace as policyNormalize } from "@jingu/policy-core"
import assert from "node:assert/strict"
import type { LoopEvent } from "@jingu/policy-core"

/** Comparable event shape after full canonicalization. */
interface ComparableEvent {
  type: string
  status: string
  parent_index: number | null
  // attempt_id intentionally excluded: contains run_id which is per-run volatile
}

/**
 * Canonicalize a raw trace to a comparable form.
 * Step 1: policyNormalize — resolves parent_event_id → parent_index, projects to NormalizedEvent
 * Step 2: strip attempt_id — it contains run_id which legitimately differs across runs
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function canonicalize(events: LoopEvent[]): ComparableEvent[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = policyNormalize(events as unknown as any[])
  return normalized.map(({ type, status, parent_index }) => ({ type, status, parent_index }))
}

/**
 * Assert that two traces are semantically equivalent after full canonicalization.
 *
 * Canonicalization removes all per-run volatile variance:
 *   - event_id, run_id, timestamp, duration_ms (not in policyNormalize output)
 *   - attempt_id (contains run_id prefix — stripped in step 2)
 *   - parent_event_id UUID resolved to parent_index (structural position)
 *
 * If the traces differ after canonicalization, the difference is real.
 * The assertion throws with a diff-friendly message.
 *
 * @param before - Trace from first run (or "before" state in refactor equivalence test)
 * @param after  - Trace from second run (or "after" state in refactor equivalence test)
 * @param label  - Optional label for assertion failure message
 */
export function assertTraceEquivalence(
  before: LoopEvent[],
  after: LoopEvent[],
  label?: string
): void {
  const canonical_before = canonicalize(before)
  const canonical_after = canonicalize(after)

  assert.deepEqual(
    canonical_before,
    canonical_after,
    `[assertTraceEquivalence]${label ? ` ${label}` : ""}: traces are not equivalent after canonicalization`
  )
}
