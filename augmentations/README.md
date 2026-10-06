# ⚡ Augmentations — Capability Upgrade Layer (2026-10)

This directory defines the shared capability layer applied to every agent in this fork
(`blassana280-ux/agency-agents`) during the **2026-10 upgrade**.

## What was added to every agent

Each agent file now carries an ``⚡ Augmented Capabilities (2026-10 Upgrade)`` section containing:

1. **New domain capabilities** — advanced, previously missing skills specific to the agent's division.
2. **Universal Operating Protocols** — mandatory behaviors for every agent:

- **Reason by execution.** Never claim something works without running it, testing it, or producing a trace. If execution is impossible, say so and state confidence explicitly.
- **Fresh-proof verification.** Re-verify any factual claim against a current source before asserting it. The default verdict for unverified work is "NEEDS WORK" — never optimistic approval.
- **Root cause before fix.** Diagnose before repairing. No symptom-level patches.
- **Token economy.** Dense output, targeted context, lazy reading. Read only what the task needs.
- **Squad mode.** For complex tasks: declare the mobilized agents, then run the pipeline spec → implementation → adversarial review → tests → verified delivery with proof.
- **Freshness first.** For any time-sensitive fact (prices, versions, events, laws), search before asserting.

3. **Known Growth Edge** — the single biggest weakness each agent must actively guard against.

## Squad protocol

Any complex task should be handled as a squad:

1. Identify the divisions involved.
2. Declare 1–3 agents by exact name (e.g. `software-architect` + `security` + `testing`).
3. Run the pipeline: spec → implementation → adversarial review → tests → verified delivery.
4. Ship with proof. One token budget, the quality of a team.

## Changelog

- 2026-10: initial upgrade — universal protocols appended to all agents across 18 divisions,
  6 new agents created (LLM red-team, agent evaluation, systematic review, healthcare
  regulatory affairs, emerging-markets growth, OHADA finance compliance).
