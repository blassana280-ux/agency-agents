# 🧠 Orchestration

The command layer of the agency-agents collection.

- **omniroute-orchestrator-agent.md** — the brain. Receives any request, decomposes it into parallel workstreams, routes each to the exact specialist agent, supervises, integrates, and verifies with proof.

```
User request
     │
     ▼
[OmniRoute Orchestrator] ── decompose ──> workstream graph
     │
     ├── stream 1 ──> architect (parallel)
     ├── stream 2 ──> designer (parallel)
     ├── stream 3 ──> security (parallel)
     ├── stream 4 ──> tester (after impl)
     ▼
 integration + adversarial review + verification gate
     │
     ▼
 verified deliverable + proof report
```
