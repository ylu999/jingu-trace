// tests/unit/emitter/loop-emitter.test.ts
// LoopEmitter unit tests — verify each method emits correct event shape

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { EventSink, LoopEvent, noopEventSink } from "@jingu/policy-core"
import { LoopEmitter } from "../../../src/emitter/loop-emitter.js"

// ---------------------------------------------------------------------------
// CapturingEventSink — records events in memory, no I/O
// ---------------------------------------------------------------------------

class CapturingEventSink implements EventSink {
  events: LoopEvent[] = []
  emit(event: LoopEvent): void { this.events.push(event) }
  flush(): Promise<void> { return Promise.resolve() }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmitter(sink: EventSink): LoopEmitter {
  return new LoopEmitter(sink, "test-run-id")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LoopEmitter", () => {
  describe("startAttempt", () => {
    it("emits attempt_started with correct type and payload", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId } = emitter.startAttempt(1, 2)

      assert.equal(sink.events.length, 1)
      const evt = sink.events[0]!
      assert.equal(evt.type, "attempt_started")
      assert.equal(evt.status, "pass")
      assert.equal(evt.duration_ms, 0)
      assert.deepEqual(evt.payload, { attempt: 1, max_attempts: 2 })
      assert.equal(evt.run_id, "test-run-id")
      assert.equal(evt.attempt_id, attemptId)
    })

    it("attempt_started has NO parent_event_id field (field must be absent)", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      emitter.startAttempt(1, 2)
      const evt = sink.events[0]!
      assert.ok(!("parent_event_id" in evt), "parent_event_id must be absent on attempt_started")
    })

    it("event_id is a non-empty string (UUID format)", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      emitter.startAttempt(1, 2)
      const evt = sink.events[0]!
      assert.ok(typeof evt.event_id === "string" && evt.event_id.length > 0)
    })

    it("timestamp is a valid ISO 8601 string", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      emitter.startAttempt(1, 2)
      const evt = sink.events[0]!
      const d = new Date(evt.timestamp)
      assert.ok(!isNaN(d.getTime()), "timestamp must parse as a valid date")
    })

    it("returns attemptId with correct format and eventId matching emitted event_id", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId, eventId } = emitter.startAttempt(3, 5)
      assert.ok(attemptId.endsWith("-a3"), "attempt_id must end with -a<attempt>")
      assert.equal(eventId, sink.events[0]!.event_id, "eventId must match the emitted event_id")
    })
  })

  describe("recordSchemaCheck", () => {
    it("emits rpp_schema_checked with pass status when valid=true", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const evtId = emitter.recordSchemaCheck(a1, a1EventId, true)

      const evt = sink.events[1]!
      assert.equal(evt.type, "rpp_schema_checked")
      assert.equal(evt.status, "pass")
      assert.equal(evt.parent_event_id, a1EventId)
      assert.equal(evt.event_id, evtId)
      assert.deepEqual(evt.payload, { valid: true })
    })

    it("emits fail status when valid=false", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      emitter.recordSchemaCheck(a1, a1EventId, false, "MISSING_REQUIRED_STAGE")

      const evt = sink.events[1]!
      assert.equal(evt.status, "fail")
      assert.deepEqual(evt.payload, { valid: false, error_code: "MISSING_REQUIRED_STAGE" })
    })

    it("no error_code in payload when not provided", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      emitter.recordSchemaCheck(a1, a1EventId, true)

      const evt = sink.events[1]!
      assert.ok(!("error_code" in (evt.payload as object)), "error_code should not be present when not provided")
    })

    it("duration_ms is a non-negative number", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      emitter.recordSchemaCheck(a1, a1EventId, true)
      const evt = sink.events[1]!
      assert.ok(typeof evt.duration_ms === "number" && evt.duration_ms >= 0)
    })
  })

  describe("recordBindingCheck", () => {
    it("emits rpp_binding_checked with pass status", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const schemaId = emitter.recordSchemaCheck(a1, a1EventId, true)
      emitter.recordBindingCheck(a1, schemaId, true, [], 5, 0)

      const evt = sink.events[2]!
      assert.equal(evt.type, "rpp_binding_checked")
      assert.equal(evt.status, "pass")
      assert.equal(evt.parent_event_id, schemaId)
      assert.deepEqual(evt.payload, { binding_valid: true, error_codes: [], checked_refs: 5, unbound_refs: 0 })
    })

    it("emits fail status when valid=false", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const schemaId = emitter.recordSchemaCheck(a1, a1EventId, false)
      emitter.recordBindingCheck(a1, schemaId, false, ["MISSING_REQUIRED_STAGE"], 0, 1)

      const evt = sink.events[2]!
      assert.equal(evt.status, "fail")
      assert.deepEqual(evt.payload, { binding_valid: false, error_codes: ["MISSING_REQUIRED_STAGE"], checked_refs: 0, unbound_refs: 1 })
    })

    it("emits skip status when skipped=true", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const schemaId = emitter.recordSchemaCheck(a1, a1EventId, false)
      emitter.recordBindingCheck(a1, schemaId, false, [], 0, 0, true)

      const evt = sink.events[2]!
      assert.equal(evt.status, "skip")
    })
  })

  describe("recordStrictnessCheck", () => {
    it("emits rpp_strictness_checked with pass status", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const schemaId = emitter.recordSchemaCheck(a1, a1EventId, true)
      const bindId = emitter.recordBindingCheck(a1, schemaId, true, [], 0, 0)
      emitter.recordStrictnessCheck(a1, bindId, true, [])

      const evt = sink.events[3]!
      assert.equal(evt.type, "rpp_strictness_checked")
      assert.equal(evt.status, "pass")
      assert.equal(evt.parent_event_id, bindId)
      assert.deepEqual(evt.payload, { strictness_pass: true, warning_codes: [] })
    })

    it("emits skip when skipped=true", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const schemaId = emitter.recordSchemaCheck(a1, a1EventId, false)
      const bindId = emitter.recordBindingCheck(a1, schemaId, false, [], 0, 0)
      emitter.recordStrictnessCheck(a1, bindId, false, [], true)

      const evt = sink.events[3]!
      assert.equal(evt.status, "skip")
    })
  })

  describe("recordReviewerResult", () => {
    it("emits reviewer_evaluated with pass status", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const schemaId = emitter.recordSchemaCheck(a1, a1EventId, true)
      const bindId = emitter.recordBindingCheck(a1, schemaId, true, [], 0, 0)
      const strictId = emitter.recordStrictnessCheck(a1, bindId, true, [])
      emitter.recordReviewerResult(a1, strictId, "pass", [])

      const evt = sink.events[4]!
      assert.equal(evt.type, "reviewer_evaluated")
      assert.equal(evt.status, "pass")
      assert.equal(evt.parent_event_id, strictId)
      assert.deepEqual(evt.payload, { verdict: "pass", issues: [] })
    })

    it("emits fail status when verdict=reject", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const schemaId = emitter.recordSchemaCheck(a1, a1EventId, true)
      const bindId = emitter.recordBindingCheck(a1, schemaId, true, [], 0, 0)
      const strictId = emitter.recordStrictnessCheck(a1, bindId, true, [])
      emitter.recordReviewerResult(a1, strictId, "reject", ["missing tradeoffs"])

      const evt = sink.events[4]!
      assert.equal(evt.status, "fail")
      assert.deepEqual(evt.payload, { verdict: "reject", issues: ["missing tradeoffs"] })
    })

    it("emits skip when skipped=true", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const schemaId = emitter.recordSchemaCheck(a1, a1EventId, true)
      const bindId = emitter.recordBindingCheck(a1, schemaId, true, [], 0, 0)
      const strictId = emitter.recordStrictnessCheck(a1, bindId, true, [])
      emitter.recordReviewerResult(a1, strictId, "pass", [], true)

      const evt = sink.events[4]!
      assert.equal(evt.status, "skip")
    })
  })

  describe("recordRetry", () => {
    it("emits retry_requested with status=fail", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const schemaId = emitter.recordSchemaCheck(a1, a1EventId, true)
      const bindId = emitter.recordBindingCheck(a1, schemaId, true, [], 0, 0)
      const strictId = emitter.recordStrictnessCheck(a1, bindId, true, [])
      const reviewId = emitter.recordReviewerResult(a1, strictId, "pass", [])
      emitter.recordRetry(a1, reviewId, 1, "gates_fail", true, [])

      const evt = sink.events[5]!
      assert.equal(evt.type, "retry_requested")
      assert.equal(evt.status, "fail")
      assert.equal(evt.parent_event_id, reviewId)
      assert.deepEqual(evt.payload, { attempt: 1, reason: "gates_fail", recoverable: true, binding_error_codes: [] })
    })
  })

  describe("recordFinalVerdict", () => {
    it("emits final_verdict with pass status when verdict=pass", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const schemaId = emitter.recordSchemaCheck(a1, a1EventId, true)
      const bindId = emitter.recordBindingCheck(a1, schemaId, true, [], 0, 0)
      const strictId = emitter.recordStrictnessCheck(a1, bindId, true, [])
      const reviewId = emitter.recordReviewerResult(a1, strictId, "pass", [])
      emitter.recordFinalVerdict(a1, reviewId, "pass", "gates_pass", 1)

      const evt = sink.events[5]!
      assert.equal(evt.type, "final_verdict")
      assert.equal(evt.status, "pass")
      assert.deepEqual(evt.payload, { verdict: "pass", reason: "gates_pass", total_attempts: 1 })
    })

    it("emits fail status for reject verdict", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const schemaId = emitter.recordSchemaCheck(a1, a1EventId, true)
      const bindId = emitter.recordBindingCheck(a1, schemaId, true, [], 0, 0)
      const strictId = emitter.recordStrictnessCheck(a1, bindId, true, [])
      const reviewId = emitter.recordReviewerResult(a1, strictId, "reject", ["bad"])
      emitter.recordFinalVerdict(a1, reviewId, "reject", "reviewer_reject", 1)

      const evt = sink.events[5]!
      assert.equal(evt.status, "fail")
      assert.deepEqual(evt.payload, { verdict: "reject", reason: "reviewer_reject", total_attempts: 1 })
    })

    it("emits fail status for invalid_output verdict", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const schemaId = emitter.recordSchemaCheck(a1, a1EventId, false)
      const bindId = emitter.recordBindingCheck(a1, schemaId, false, ["MISSING_REQUIRED_STAGE"], 0, 1)
      const strictId = emitter.recordStrictnessCheck(a1, bindId, false, [], true)
      const reviewId = emitter.recordReviewerResult(a1, strictId, "pass", [], true)
      emitter.recordFinalVerdict(a1, reviewId, "invalid_output", "binding_unrecoverable", 1)

      const evt = sink.events[5]!
      assert.equal(evt.status, "fail")
      assert.deepEqual(evt.payload, { verdict: "invalid_output", reason: "binding_unrecoverable", total_attempts: 1 })
    })
  })

  describe("noopEventSink — emitter does not throw", () => {
    it("all methods work with noopEventSink without throwing", () => {
      const emitter = new LoopEmitter(noopEventSink, "noop-run")
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const s1 = emitter.recordSchemaCheck(a1, a1EventId, true)
      const b1 = emitter.recordBindingCheck(a1, s1, true, [], 0, 0)
      const st1 = emitter.recordStrictnessCheck(a1, b1, true, [])
      const r1 = emitter.recordReviewerResult(a1, st1, "pass", [])
      const ret1 = emitter.recordRetry(a1, r1, 1, "gates_fail", true, [])
      const { attemptId: a2, eventId: a2EventId } = emitter.startAttempt(2, 2)
      const s2 = emitter.recordSchemaCheck(a2, a2EventId, true)
      const b2 = emitter.recordBindingCheck(a2, s2, true, [], 0, 0)
      const st2 = emitter.recordStrictnessCheck(a2, b2, true, [])
      const r2 = emitter.recordReviewerResult(a2, st2, "pass", [], true)
      emitter.recordFinalVerdict(a2, r2, "pass", "gates_pass", 2)
      assert.ok(typeof ret1 === "string")
    })
  })

  describe("parent_event_id linkage", () => {
    it("subsequent events have parent_event_id set to passed parentId", () => {
      const sink = new CapturingEventSink()
      const emitter = makeEmitter(sink)
      const { attemptId: a1, eventId: a1EventId } = emitter.startAttempt(1, 2)
      const s1 = emitter.recordSchemaCheck(a1, a1EventId, true)
      const b1 = emitter.recordBindingCheck(a1, s1, true, [], 0, 0)
      const st1 = emitter.recordStrictnessCheck(a1, b1, true, [])
      const r1 = emitter.recordReviewerResult(a1, st1, "pass", [])
      emitter.recordFinalVerdict(a1, r1, "pass", "gates_pass", 1)

      const [evtAttempt, evtSchema, evtBind, evtStrict, evtReview, evtVerdict] = sink.events as LoopEvent[]
      assert.ok(evtAttempt !== undefined)
      assert.ok(evtSchema !== undefined)
      assert.ok(evtBind !== undefined)
      assert.ok(evtStrict !== undefined)
      assert.ok(evtReview !== undefined)
      assert.ok(evtVerdict !== undefined)

      assert.ok(!("parent_event_id" in evtAttempt))
      assert.equal(evtSchema.parent_event_id, evtAttempt.event_id)
      assert.equal(evtBind.parent_event_id, evtSchema.event_id)
      assert.equal(evtStrict.parent_event_id, evtBind.event_id)
      assert.equal(evtReview.parent_event_id, evtStrict.event_id)
      assert.equal(evtVerdict.parent_event_id, evtReview.event_id)
    })
  })
})
