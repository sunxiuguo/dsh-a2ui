# DSH A2UI

An independent, protocol-first A2UI integration for DeepSeek Harness.

**Status: 0.1.0-alpha.1, development preview.** This is an additional project, not a replacement for DSH GenUI. Our direction is complete, interoperable mainstream-protocol support. The first milestone validates a bounded A2UI workflow, not the whole standard or production DSH deployment.

## What you can run today

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run build
npm run dev
```

Open the local URL printed by Vite. Click **Stream synthetic example**, edit the workshop topic, and click **Preview request**. The official renderer emits a standard action envelope into the demo log. Export the recording, restore it, and verify the edited value is retained while historical actions are **not** sent again.

The example is synthetic. It performs no booking, payment, external request, model call, or customer-data access. No account or API key is needed. The standalone demo's action sink is a local log, not a live DSH session.

## The integration

- Standard A2UI v0.9 / v0.9.1 message envelopes and official basic-catalog schemas, pinned from the v0.9.1 specification.
- Official `@a2ui/react` and `@a2ui/web_core` 0.14.0, not a renamed custom UI protocol.
- Strict validation before processing. Unknown components, foreign catalogs, invalid lifecycle, cyclic trees and invalid final references fail visibly rather than being silently dropped.
- Incremental JSONL decoder and DSH streaming tool-argument extraction.
- DSH `render_a2ui` tool saves validated messages in presentation metadata, with a dedicated conversation node and renderer.
- Interactive actions return to the owning DSH conversation as an explicitly labelled data message. Delivery failure is visible and is not automatically retried.
- Portable recording export includes current field state in a separately bounded snapshot section, so a full 512-message history remains exportable. Import restores UI messages only; recorded actions are historical evidence and never execute during replay.

## DSH installation boundary

The adapter is typechecked against the **exact DSH 0.2.0-rc.2 SDK**, with Cordis 4.0.5. Other DSH versions are not certified. Do not infer compatibility from a broad semver range or the npm `latest` tag.

```sh
npm run build:plugin
npm pack --ignore-scripts
```

The resulting package contains the server entry, client entry and `cordis.patch.yml` bundle contribution. Install the local package through your DSH profile's supported plugin-package workflow. This project does not change your global profile, permissions, model, or credentials. It is not published to npm yet. **Live DSH installation is not yet verified.** The standalone synthetic browser roundtrip passed in sandboxed Google Chrome 155.0.8059.39 on [this exact-commit CI run](https://github.com/sunxiuguo/dsh-a2ui/actions/runs/39986572817); this is not host acceptance.

The main model calls `render_a2ui` with `{ "messages": [...] }`. Use `demo/fixture.ts` as a synthetic contract example. In hosts without the browser plugin, the text receipt states only that validation succeeded, not that a UI was displayed. Code Mode rendering is not certified.

A separate [packed server-service acceptance](docs/packed-host-acceptance.md) now verifies loading the actual package through Cordis and the DSH tool execution pipeline, including rejected calls and unload/remount. This is narrower than complete DSH host installation and does not certify the client or model loop.

## Current limits, not the final product boundary

This alpha permits only the official basic catalog and bounds documents to 256 KiB, 512 messages, 8 active surfaces and 256 components per surface. It disables external media components and navigation, including external links/media in Markdown, as an initial deployment policy. That policy is narrower than A2UI itself. Actions are limited before sending to 16 KiB each, 128 attempts per session, and a 256 KiB retained/in-flight budget. Streaming DSH previews cannot send actions before final tool validation; failed/cancelled results withdraw the preview. Recordings bound history, snapshots and actions separately and never resend historical actions.

The demo export preserves edits. DSH durable metadata replays the model-authored document; unsent local edits are not yet persisted across a DSH reload. Sent actions are carried by ordinary DSH conversation history. Cross-turn action-aware restoration, host-managed export/import, cancellation and Code Mode parity are follow-on work, not completed claims.

No transport fetching, arbitrary remote catalogs, dynamic code, HTML injection, credentials or payment actions are included. A2UI v1.0 is a release candidate upstream and is not supported here yet.

## Why a separate project?

Existing implementations already offer useful DSH A2UI rendering. See [the comparison](docs/alternatives.md). This project's testable emphasis is official-renderer interoperability, strict rejection without silent sanitization, and portable replay that never re-executes historical actions. These are engineering hypotheses to validate with users, not evidence of unmet market demand or adoption. We do not claim to be the first DSH A2UI integration.

## Roadmap and acceptance

1. Alpha: official-schema fixtures, streaming, strict validation, renderer/action roundtrip and portable snapshots.
2. DSH acceptance: install a packed plugin in an isolated supported host; prove live streaming, click → model turn, reload, multiple surfaces, failed deliveries and cancellation.
3. Complete stable A2UI: full basic-catalog conformance, theme/validation/function coverage, approved media/navigation policy, accessibility and cross-renderer parity.
4. Durable interaction history: replay local edits and actions accurately without accidental resubmission, with migration/version tests.
5. Additional mainstream protocols through explicit versioned adapters, never relabelled proprietary payloads. Evaluate A2UI 1.0 when its contract stabilizes.

A feature moves to supported only when its end-to-end test and limitations are documented. Public release, stars and tests are not adoption or revenue.

## Development and verification

Tests use synthetic data. jsdom component tests have a no-layout constructable-stylesheet shim; they are not Chrome, visual or live-DSH tests. Read [verification](docs/verification.md) for actual commands and outstanding checks.

Dependencies are exact at the top level and transitively locked by `package-lock.json`. Installation above disables lifecycle scripts. The included minimal CI workflow uses a standard GitHub-hosted runner with read-only contents permission; it does not deploy or use secrets. No deployment account is required.

## License

MIT for project-authored code. Official A2UI schemas and bundled dependencies retain their respective notices; see [NOTICE.md](NOTICE.md) and `vendor/a2ui/LICENSE`. Not affiliated with or endorsed by DeepSeek, Google, or the A2UI project.
