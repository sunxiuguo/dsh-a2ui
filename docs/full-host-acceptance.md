# Full DSH Web-host acceptance

Status: **passed for the bounded synthetic scenario** at source
[`a8bb06d8`](https://github.com/sunxiuguo/dsh-a2ui/commit/a8bb06d8acdfdc9bcffb005fd34a378ec741c312),
[run 40092097281](https://github.com/sunxiuguo/dsh-a2ui/actions/runs/40092097281),
on 2026-10-24 from 12:01:18 to 12:01:36 UTC. This is the actual shipped Web host,
separate from the standalone browser demo and SDK/jsdom examples.

The [unaltered receipt](evidence/full-host-a8bb06d8.json) records 132 HTTP RPC
requests, two WebSocket connections, two nonempty persistence files, zero
external requests, zero page errors and verified cleanup. Its `visualReview`
field is the automation-time value; subsequent independent review of both
[Session A](assets/full-host-session-a.png) and
[restored Session B](assets/full-host-session-b-restored.png) found no blocking
privacy or legibility issue. Session B is naturally scrolled and is not a full
conversation overview. These screenshots are real, unmodified synthetic runs,
not interface mockups.

An initial YAML parse failure executed no jobs. Two early host attempts stopped
at the first synthetic turn and verified cleanup. A source-backed native
AgentLoop regression established that the scripted provider was mistaking
`source.kind: runtime-context` user-role messages for human input. The correction
ignores only that documented context source; strict unknown-input and
cross-session checks remain. This was a test-provider integration correction,
not a claim that a live model was repaired.

The harness installs the packed plugin through the official DSH 0.2.0-rc.2 CLI,
serves the shipped Web frontend, and uses actual HTTP RPC and WebSocket mux
transport. Only the model adapter is scripted. It has no model API key and makes
no external model calls. Ordinary model-authored tool calls, native session
handling, tool execution, rendering and JSONL persistence remain real.

## Test scope

- Normal first-run notice and composer, not pre-seeded onboarding state.
- Two sessions, overlapping surface IDs, and independently edited controls.
- UI actions reaching their owning real AgentLoop turn.
- Pre-admission delivery failure, explicit retry, and cancellation.
- Graceful process shutdown, persistence files, a fresh browser context and
  reopening the same conversations without replaying historical actions.
- Authored history and unsent draft behavior are asserted separately.

This passing execution covers only the pinned source, host and scenario.
Preparation or provider unit tests alone were not treated as acceptance. Live models,
complete protocol semantics, accessibility, deployment security and all component
variants remain outside this bounded synthetic run.

## Isolation and temporary local authentication

The real host requires native browser authentication. Its launch token lives in
process memory; its browser-session signing grant is written to the new test
home. The harness must have explicit authorization for this temporary access.
It never disables native authentication, uses a real account, or imports an
existing profile.

The orchestration creates a new disposable HOME/DSH_HOME/workspace and uses an
environment allowlist. It binds to 127.0.0.1 only, retains child output privately,
blocks non-loopback Node TCP and browser HTTP/WebSocket egress, disables external provider/telemetry probes,
and does not collect raw console output, traces, HAR, storage state or cookies.
All dependency lifecycle scripts are disabled, including the plugin-manager
fallback path. The independent runtime lock includes the full official CLI
closure; resolving only the plugin's eight peers is insufficient.

Cleanup closes the browser context and native host process group, removes only
the current invocation's test world, and verifies removal. The only CI uploads are
an allowlisted sanitized receipt and two post-login synthetic UI screenshots; it excludes the home, configuration, logs,
profiles and credentials. Screenshots require separate visual inspection before claiming visual acceptance.
Failure reports give the phase, error class, allowlisted harness source coordinate
and fixed event counts rather than token-bearing Playwright or host output.

## Execution policy

The existing workflow contains a single exact commit-message + first-run-attempt
gate for the explicitly approved experiment. Ordinary future pushes and PRs do
not launch this host or generate test credentials. A new execution requires its
own reviewed scope and authorization; editing a test marker is not authorization.
No additional workflow, repository permission, real account or model credential
is introduced.

Test-only code: `scripts/full-host/`. The runtime package lock is isolated from
the public plugin's normal dependencies and does not change its version.

## Pinned upstream reference

The host recipe and browser selectors were checked against DeepSeek Harness
[`639ed015397290b3745d163aafe02ffee4aa3f84`](https://github.com/deepseek-ai/deepseek-harness/tree/639ed015397290b3745d163aafe02ffee4aa3f84), including
[the official Web scaffold](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/web/tests/scaffold.ts),
CLI argument/profile composition, generated SessionController remotes and shipped
workspace/composer controls. The upstream project's external-PR policy is
respected: this is an independent ecosystem plugin, not an upstream contribution.
