# Experimental opt-in v1 reply choices

This experimental source branch is **not registered by the default plugin**,
is not enabled or released for users, and does not claim general A2UI v1.0 compatibility. The normal
`render_a2ui` tool, legacy client and v0.9/v0.9.1 behavior remain unchanged.

## Purpose and supported contract

A model can offer a short set of structured reply choices using an already
parsed, canonical v1.0 document. Clicking a choice forwards the complete
validated v1 action envelope as **labelled untrusted data** through the owning
DSH conversation controller. `userMessage` is preserved as data alongside
surface/component identity, timestamp and resolved context, not promoted to
an executable instruction or substituted for the full event.

The isolated tool is `render_a2ui_reply_v1`. Its source entry is
`src/experimental/v1-reply/tool.ts`; its separate client entry is
`src/experimental/v1-reply/client.tsx`. No root export, manifest, normal build,
profile or version has been changed to enable it for ordinary users.

- Exact v1.0 canonical messages; explicitly pinned basic v1 catalog.
- Self-contained tool documents with create/update/model/delete chronology.
- `Column` with static children, plain-text `Text`, and `Button` whose `child`
  is one Text label and whose event explicitly supplies `userMessage`.
- Literal values and `@path` bindings, including data updates within the same
  complete document. Official SDK resolution produces the event.
- Complete rooted trees only: no cycles, shared children, unreachable nodes,
  missing references or duplicate IDs within a batch.
- No interactive preview: controls appear only after valid final tool metadata.
  Pending, failed, cancelled, malformed or removed results withdraw controls.
- Equal canonical replay does not reconstruct the active session or resend
  prior actions. Changed documents create a new scoped session and dispose the
  old one. Portable recording replay copies evidence only, never calls send.
- Send attempts and bytes are reserved before awaiting transport. A rejected or
  ambiguous result is never automatically retried; the user can inspect the
  conversation and choose another explicit click.

## Deliberately rejected / unqualified

All other components, extra layout/accessibility/validation properties,
per-component catalogs, templates, functions (`@call`), RPC, navigation, media,
metadata extensions and sendDataModel are rejected. Function directives are
also denied inside model/event data in this conservative slice. Labels are
plain React text, not HTML or Markdown. Function-capable catalog entries are
never exposed through the accepted authored contract.

An entire accepted document is bounded to 128 messages, 128 KiB, eight created
surface IDs, 256 authored component entries and JSON/tree depth 24. Deleted
surface IDs cannot be reused within that document. Actions are at most 16 KiB,
128 attempts and 256 KiB of recorded/reserved envelopes per mounted document.
These are deployment limits, not claims about the A2UI standard.

There is no update-only continuation across independent tool calls, A2A/AG-UI
transport conformance, live model claim or exactly-once delivery guarantee.
Changing the document starts a new interaction budget. Reloading a portable
recording does not preserve unrecorded failed attempts or unsent drafts.

`DirectJsonFormatFactory` is an inference parser, not a DSH transport setting.
It is neither required nor added as a dependency by this candidate. If a model
pipeline uses it, it must still produce the canonical tool argument expected
here. There is no silent v1-to-v0.9 conversion.

## Dependency and source provenance

The v1 schemas/catalog are copied unchanged from
`a2ui-project/a2ui@409ded29ccac3eebc541979ae5320771703248e8` and retain Apache-2.0
license under `vendor/a2ui-v1-reply/`. This is a candidate specification.
The executable runtime is the already pinned official npm
`@a2ui/web_core@0.14.0`; no new dependencies or install scripts were introduced.
The official React package at that version targets the legacy model, so this
slice uses small plugin-owned React views over the public canonical
MessageProcessor/NodeResolver. It does not replace the default renderer.

## Reproduce locally in an isolated cloud workspace

With the repository's exact existing dependencies available:

1. `node node_modules/typescript/bin/tsc --noEmit`
2. `node node_modules/vitest/vitest.mjs run`
3. `node node_modules/vite/bin/vite.js build --config vite.reply-v1.config.ts`
4. `node node_modules/vitest/vitest.mjs run --config vitest.reply-v1-host.config.ts`

The service acceptance uses actual official DSH client session, controller,
event registry, view assembly, renderer and slot packages. Its remote `prompt`
endpoint is synthetic and in-memory. It does not run the native server,
HTTP/WebSocket bridge, real AgentLoop, provider, persistence or complete shell.
The jsdom stylesheet shim remains layout-free and is not browser validation.

### Real browser service fixture

After step 3, run
`node node_modules/vite/bin/vite.js --config vite.reply-v1-dev.config.ts`.
Open `http://127.0.0.1:4187/reply-v1-host.html` in the **cloud** browser. This route
uses those actual client services and packed experimental client with the same
synthetic prompt endpoint. No authentication, credentials, public deployment
or network model is involved.

Use both sessions' literal/dynamic choices, replace B, replay A, reject the
next delivery and explicitly retry, mark A pending, cancel/remove/restore A,
and submit malformed A. The captured prompts should retain the owning session,
full validated envelope, and no extra sends caused by any replay/withdrawal.
Browser execution and visual review must be recorded separately; creating this
fixture is not proof it passed. The existing native full-host recipe creates
new temporary authentication material and must not be run under a historical
approval for a different artifact.

### Existing pull-request browser acceptance

The existing acceptance workflow builds the isolated client before running
`npm run test:browser`. `browser-tests/reply-v1.spec.ts` opens this synthetic
service fixture through the same Vite server at port 4173 and sandboxed Chrome.
It uses real clicks and keyboard input, not direct action-handler invocation.
The PR path does not run the native full-host or master showcase steps.
A green browser run plus inspection of its synthetic screenshots is still
required: source preparation, jsdom tests and test discovery alone are not
browser or full-host acceptance. No real model, credentials or customer data
are used. Evidence contains only synthetic screenshots and assertion summaries.
