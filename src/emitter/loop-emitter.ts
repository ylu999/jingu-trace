// emitter/loop-emitter.ts
// LoopEmitter — emits causally-linked LoopEvents during runGovernedLoop()
//
// All events are system-generated facts derived from validator/gate/function results.
// Parent chain: attempt_started → schema_checked → binding_checked → strictness_checked
//               → reviewer_evaluated → [retry_requested] → final_verdict

import { LoopEvent, EventSink, noopEventSink } from "@jingu/policy-core"
import crypto from "crypto"

export class LoopEmitter {
  private sink: EventSink
  private runId: string
  private attemptStartTimes: Map<string, number> = new Map()

  constructor(sink: EventSink, runId: string) {
    this.sink = sink
    this.runId = runId
  }

  startAttempt(attempt: number, maxAttempts: number): { attemptId: string; eventId: string } {
    const attemptId = `${this.runId}-a${attempt}`
    const eventId = crypto.randomUUID()
    const now = Date.now()
    this.attemptStartTimes.set(attemptId, now)

    this.sink.emit({
      event_id: eventId,
      run_id: this.runId,
      attempt_id: attemptId,
      // parent_event_id: OMIT — root event, field must be absent
      type: "attempt_started",
      timestamp: new Date(now).toISOString(),
      status: "pass",
      duration_ms: 0,
      payload: { attempt, max_attempts: maxAttempts },
    } as LoopEvent)
    return { attemptId, eventId }
  }

  private elapsed(attemptId: string): number {
    const start = this.attemptStartTimes.get(attemptId) ?? Date.now()
    return Date.now() - start
  }

  recordSchemaCheck(attemptId: string, parentId: string, valid: boolean, errorCode?: string): string {
    const id = crypto.randomUUID()
    this.sink.emit({
      event_id: id,
      run_id: this.runId,
      attempt_id: attemptId,
      parent_event_id: parentId,
      type: "rpp_schema_checked",
      timestamp: new Date().toISOString(),
      status: valid ? "pass" : "fail",
      duration_ms: this.elapsed(attemptId),
      payload: { valid, ...(errorCode !== undefined ? { error_code: errorCode } : {}) },
    } as LoopEvent)
    return id
  }

  recordBindingCheck(
    attemptId: string,
    parentId: string,
    valid: boolean,
    errorCodes: string[],
    checkedRefs: number,
    unboundRefs: number,
    skipped = false,
  ): string {
    const id = crypto.randomUUID()
    this.sink.emit({
      event_id: id,
      run_id: this.runId,
      attempt_id: attemptId,
      parent_event_id: parentId,
      type: "rpp_binding_checked",
      timestamp: new Date().toISOString(),
      status: skipped ? "skip" : valid ? "pass" : "fail",
      duration_ms: this.elapsed(attemptId),
      payload: { binding_valid: valid, error_codes: errorCodes, checked_refs: checkedRefs, unbound_refs: unboundRefs },
    } as LoopEvent)
    return id
  }

  recordStrictnessCheck(
    attemptId: string,
    parentId: string,
    pass: boolean,
    warningCodes: string[],
    skipped = false,
  ): string {
    const id = crypto.randomUUID()
    this.sink.emit({
      event_id: id,
      run_id: this.runId,
      attempt_id: attemptId,
      parent_event_id: parentId,
      type: "rpp_strictness_checked",
      timestamp: new Date().toISOString(),
      status: skipped ? "skip" : pass ? "pass" : "fail",
      duration_ms: this.elapsed(attemptId),
      payload: { strictness_pass: pass, warning_codes: warningCodes },
    } as LoopEvent)
    return id
  }

  recordReviewerResult(
    attemptId: string,
    parentId: string,
    verdict: "pass" | "reject",
    issues: string[],
    skipped = false,
  ): string {
    const id = crypto.randomUUID()
    this.sink.emit({
      event_id: id,
      run_id: this.runId,
      attempt_id: attemptId,
      parent_event_id: parentId,
      type: "reviewer_evaluated",
      timestamp: new Date().toISOString(),
      status: skipped ? "skip" : verdict === "pass" ? "pass" : "fail",
      duration_ms: this.elapsed(attemptId),
      payload: { verdict, issues },
    } as LoopEvent)
    return id
  }

  recordRetry(
    attemptId: string,
    parentId: string,
    attempt: number,
    reason: string,
    recoverable: boolean,
    bindingErrorCodes: string[],
  ): string {
    const id = crypto.randomUUID()
    this.sink.emit({
      event_id: id,
      run_id: this.runId,
      attempt_id: attemptId,
      parent_event_id: parentId,
      type: "retry_requested",
      timestamp: new Date().toISOString(),
      status: "fail",
      duration_ms: this.elapsed(attemptId),
      payload: { attempt, reason, recoverable, binding_error_codes: bindingErrorCodes },
    } as LoopEvent)
    return id
  }

  recordFinalVerdict(
    attemptId: string,
    parentId: string,
    verdict: "pass" | "fail" | "reject" | "invalid_output",
    reason: string,
    totalAttempts: number,
  ): string {
    const id = crypto.randomUUID()
    this.sink.emit({
      event_id: id,
      run_id: this.runId,
      attempt_id: attemptId,
      parent_event_id: parentId,
      type: "final_verdict",
      timestamp: new Date().toISOString(),
      status: verdict === "pass" ? "pass" : "fail",
      duration_ms: this.elapsed(attemptId),
      payload: { verdict, reason, total_attempts: totalAttempts },
    } as LoopEvent)
    return id
  }
}

export { noopEventSink }
