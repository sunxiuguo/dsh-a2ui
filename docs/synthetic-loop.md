# No-key agent-loop walkthrough

Run from a **repository source checkout**, using Node 24.19.0:

```sh
npm ci --ignore-scripts
npm run build:plugin
npm run demo:loop
npm run demo:loop -- "Wheel-thrown pottery"
```

The executable walkthrough automatically edits and clicks a form in jsdom, prints
each step, and exits nonzero if the bounded loop fails. It does not open a browser
server or an interactive terminal. The optional topic must be one line of 1–200 characters;
use made-up data only. No key, account, external service, user profile, booking or
payment is needed.

The plugin tarball does **not** ship `examples/` or install development dependencies.
Installing that tarball into DSH is not enough to run this walkthrough; use the
source checkout and its locked development dependencies. The additional official
dependency is `@deepseek-ai/dsh-agent-loop@0.2.0-rc.2`.

## Follow the action into the next turn

1. An initial prompt passes through the official client conversation send controller.
2. An explicit in-process bridge queues it in the real DSH `AgentLoop`.
3. A deterministic local `LlmAdapter` streams a `render_a2ui` tool call. The real
   `ToolRuntime` validates it and records the result. The following model step
   receives that real tool result.
4. Actual session events feed the official conversation assembler, renderer slot
   and A2UI form. The walkthrough edits **Workshop topic** and clicks **Preview request**.
5. The plugin sends the standard action through the official client send controller.
   The next real agent turn receives the edited topic and renders
   **Synthetic preview for: your topic** using another real tool call.

Expected output:

```text
PASS: 2 completed agent turns, 4 provider calls, 2 real tool results, 1 UI action.
```

Assertions check the edited value, unchanged model-authored history, successful
tool results, completed turns, and exactly one action delivery. Successful
tool-result events are not fabricated by the example.

## Boundary

Real components include Cordis 4.0.5, DSH 0.2.0-rc.2 AgentLoop/LLM/tool/session
services, official client conversation/slot/React rendering services, and the built
plugin's server and browser artifacts. The model, prompt/event bridge, minimal
root/chat target and DOM environment are synthetic.

This is **not** full DSH shell/composer activation, the server SessionController,
HTTP/WebSocket delivery, a live model, visual browser QA, cancellation, reload
persistence or production acceptance. The provider streams SDK chunks, but the
client receives settled session events, not transient streaming-preview frames.

`npm run test:packed` runs the same walkthrough against the actual extracted npm
artifact. Internally, `DSH_A2UI_PACKED_PATH` selects that artifact instead of the
checkout's `lib` files. That does not add examples to the distributed tarball.
