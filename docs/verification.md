# Verification ledger

Environment: isolated cloud workspace, Node 24.19.0. Synthetic data only.

- Protocol fixture tests exercise strict schema rejection, lifecycle, topology, fragmented JSONL and non-executing replay.
- SDK typechecking targets DSH 0.2.0-rc.2 and Cordis 4.0.5.
- Browser-like component tests use jsdom 26.1.0. Constructable stylesheet `replaceSync` is shimmed because jsdom lacks layout support. These tests do not certify styling, browser security boundaries or a live DSH host.
- Vite builds produce standalone preview and plugin entries. A successful bundle is not an installation result.

Outstanding before production readiness: full visual/accessibility and catalog interaction coverage; live-model DSH workflows beyond the bounded synthetic full-host acceptance; host permission and Code Mode behavior; complete stable-catalog and function conformance; independent security review.

Commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run build:plugin`.

Use exact source commit and observed results from a release's notes; do not treat this checklist as proof those commands passed on a later revision.

## Real-browser acceptance workflow

The repository workflow uses standard GitHub-hosted Ubuntu 24.04, read-only
contents permissions, no persisted checkout credentials and no real-account or
model credentials. The separate controlled full-host experiment generated only
explicitly authorized temporary local test credentials and verified their cleanup. Official
checkout/setup-node actions are pinned to commit SHAs. Playwright 1.56.1 is locked;
Chromium runs with its sandbox enabled. The test blocks requests outside loopback,
streams synthetic data, edits a real input, clicks an action, exports the recording,
reloads the page, restores it and checks that historical actions were not resent.
No deployment, external model call or paid larger runner is used. Later reviewed
showcase and full-host steps upload only bounded synthetic artifacts, as documented below.

`npx playwright test --list` only verifies test discovery. A committed workflow is
not proof of a passing browser run. Record the exact run URL and commit after GitHub
reports a terminal result. This standalone browser test is still not a live DSH
installation test.

The first browser run (39986031646) failed before page navigation because the
Playwright-downloaded headless shell could not establish its sandbox on Ubuntu
24.04. No security settings were changed. The workflow now selects the runner's
preinstalled Google Chrome stable through Playwright's documented `chrome` channel,
with `chromiumSandbox: true`, and prints its actual version. GitHub's standard
Ubuntu image lists Chrome; Chromium documents Ubuntu's existing profile for
Chrome stable's default installation. This uses that installed browser normally,
not a copied binary, custom profile, sysctl change or disabled sandbox. Its outcome
still requires a successful exact-commit run.

Sources: [GitHub runner image](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md),
[Playwright channels](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge),
[Chromium AppArmor explanation](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md).

## Observed browser result

On 2026-10-23 at 16:25:35 UTC, [run 39986572817](https://github.com/sunxiuguo/dsh-a2ui/actions/runs/39986572817)
completed successfully at commit `727e1816e5c0f0cab88c4797b930b07c2f4d6019`.
The log records Google Chrome 155.0.8059.39 and one passing real-browser test:
stream → edit input → click action → export → full-page reload → restore edited
value without resending historical actions. The 94 synthetic contract/unit tests,
typecheck and both builds also passed. Chrome ran with sandbox enabled.
This is a standalone demo result, not live DSH host acceptance, full catalog
interaction coverage, a visual audit, adoption or production-readiness proof.


## Alpha.7 follow-path regression

The packed acceptance command includes success and cancellation cases through the
installed rc.2 history follow and client assistant-stream pipeline. It detects the
alpha.6 stale-preview error by cancelling a real streamed provider attempt, not by
fabricating a tool failure. The successful flow includes actual history resync;
the cancellation flow includes resync and fresh client-binding replay. See the
[acceptance boundary](packed-host-acceptance.md#streamed-cancellation-fixed-in-alpha7).
These remain jsdom/local-carrier results, not a new Chrome or full-shell claim.

## Alpha.8 validation compatibility regression

The compatibility tests distinguish a valid official `validationRegexp` property
from a currently unsupported runtime behavior. Both envelope versions reject it
before renderer mutation, while unchanged author-supplied `checks.regex` validates
the field and independently gates its Button. Coverage includes JSONL, the SDK
tool, preview/final node projection, old recording rejection and positive replay.
The packed server acceptance also checks both versions through the actual
ToolRuntime, including absence of presentation metadata for rejected documents.

The validation browser scenario adds demo switching/reset and export/restore
checks; two negative cases retain an existing valid form when an incompatible
recording is rejected. These are runnable checks, not claims of a new passing
Chrome or full DSH-shell run. The release's exact-commit evidence remains required.

## Actual shipped Web host result

[Run 40092097281](https://github.com/sunxiuguo/dsh-a2ui/actions/runs/40092097281)
passed at `a8bb06d8acdfdc9bcffb005fd34a378ec741c312`. The official CLI installed
the packed alpha.8 plugin into a new complete Web profile. Native authentication,
HTTP RPC, WebSocket streaming, two sessions with overlapping surface IDs,
editing/action-to-next-turn, controlled pre-admission rejection and explicit
retry, native cancellation/recovery, and process restart with exact authored
history restoration all passed. Reopening sent no historical action or model
request. Unsent drafts intentionally reverted to authored values.

Only the provider is scripted. No external model or real account was used.
All temporary native test credentials and browser state were removed, with
cleanup verified. Two actual shell screenshots passed independent visual/privacy
review. See the [full scope, source, receipt and limitations](full-host-acceptance.md).
This does not certify live models, every component/function, all failure modes,
Code Mode, accessibility, production deployment security, adoption or revenue.
