# jingu-trace — Boundary Rules

## Responsibilities

- Single home for all event generation (emit facts only)
- LoopEmitter: produces causally-linked LoopEvents during runGovernedLoop
- FileEventSink: JSONL append to disk
- noopEventSink: no-op for tests

## Hard rules

1. jingu-trace MUST NOT import from:
   - jingu-agent
   - jingu-builder
   - jingu-observability-core
   - any system that consumes trace output

2. jingu-trace generates facts only:
   - No validation logic (that belongs in policy-core)
   - No decision making (that belongs in agent)
   - No retry logic (that belongs in agent)
   - No storage or querying (that belongs in observability)

3. All events MUST be produced via LoopEmitter:
   - Direct event object construction by callers is forbidden
   - This protects causal chain integrity, consistency, and determinism

## Dependency direction

```
policy-core (types: LoopEvent, EventSink)
     ↑
jingu-trace (emitter + sinks)
     ↑
jingu-agent (consumes @jingu/trace)
```

trace imports from: policy-core (types only)
trace is imported by: agent, builder
trace MUST NOT depend on: observability, agent, builder
