# Exact rc.3 SDK compatibility experiment

Run in a fresh cloud container with Python 3.11.8+ or 3.12+, Node 24.19.0,
npm 11.9.0 and pnpm 11.19.0:

```sh
python3 validation/rc3/validate-rc3.py
```

The driver downloads and verifies immutable source commit
`bbb205aa5f3363c654dd23d23008e5c40b6c31ef`, builds its original locked rc.2
artifact, and checks the exact tarball SHA-256
`e443574896684a5140edc6d6394923b71fdc2a95398cf76b7bcd179eabd5ddef`.
It installs a separate exact rc.3 SDK consumer using the included frozen pnpm lock.
The plugin's bytes, dependencies, peers and engine range remain unchanged.
All dependency lifecycle scripts are disabled; only the inspected build commands run.

Before behavior runs, it consumes the complete `SHA256SUMS` input inventory and
the 22-package `official-packages.json` archive inventory, validates package
identity/source/scripts, checks all original source and installed artifact files,
and checks versions from both fixture and installed-plugin peer contexts.
It also verifies that generated fixture changes match `fixture-adaptations.patch`.
Checksums detect input changes; they are not a signature or source-build attestation.

Expected result: nine passing synthetic fixture commands. They cover rendering
metadata, an actual two-session action reaching the owning next agent turn,
cancellation withdrawal/recovery, UI replay and cold JSONL history restoration.
The model, admission transport, minimal UI projection and jsdom are synthetic.
For this SDK run, native CLI/full host, authentication, HTTP/WebSocket transport,
visual layout, real models and production compatibility remain untested at rc.3.
This is no adoption claim and does not broaden the published compatibility ranges.

Normal pnpm 11.19.0 resolution succeeded in this experiment. Normal npm 11.9.0
resolution separately failed with `ERESOLVE`: default prerelease peer matching
excludes rc.3 from `>=0.2.0-rc.2 <0.3.0`. Native DSH's inspected checker uses
`includePrerelease: true`. The known npm failure is not a prerequisite for the
positive run. To reproduce it deliberately, add `--npm-counterexample`; never
use force or legacy-peer overrides.

For repeated cloud checks using already verified inputs, add `--offline` and
`--source-archive`, `--source`, `--artifact`, `--consumer`, `--package-cache` with
their absolute prepared paths. `--check-only` stops after provenance/resolution.
Run `test-guards.py` with those same five path arguments for six bounded positive
and tamper tests. The driver prints a task-local evidence directory; no logs,
profiles, credentials, dependency trees or runtime configuration are distributed here.

The original rc.2 fixtures remain intact. The patch records version guards,
the declared gateway browser asset, the API controller's declared Zod 4.4.3,
JSONL's public plugin mounting
API and accurate receipt labels. `two-session-body.mjs` extends the original
loop prefix with explicit owner, unchanged-other-session and replay assertions.
The conversation browser factory externalizes Zod without declaring a direct
dependency, so these fixtures supply the API controller's real declared version.
This does not validate native-host external-module wiring or rely on hoist state.
See `NOTICE.md` and the repository license for attribution.
## Separately authorized native HTTP acceptance (2026-10-29)

A later, independently reviewed cloud experiment passed a bounded native HTTP
workflow with official DSH **0.2.1-rc.3** and the unchanged **0.1.0-alpha.13**
plugin. Verified inputs:

- Official npm `@deepseek-ai/dsh@0.2.1-rc.3`, whose manifest identifies
  `deepseek-ai/deepseek-harness`, `apps/cli`; archive SHA-256:
  `9a8f9493bfab8218215a8ca38ab8821e76dff63dc4fcb65841ef87c0aa277141`.
- Plugin source `bbb205aa5f3363c654dd23d23008e5c40b6c31ef`; local tarball SHA-256:
  `e443574896684a5140edc6d6394923b71fdc2a95398cf76b7bcd179eabd5ddef`.
  All 90 installed plugin files matched the archive.

Normal `dsh plugin --profile <synthetic-profile> add <local-tarball> --ignore-scripts`
installation succeeded with pnpm 11.19.0. That fresh custom
profile was base-backed. The later HTTP run reused the verified installed tree
in a fresh isolated profile with `@deepseek-ai/dsh-base`,
`@deepseek-ai/dsh-web-app` and `dsh-a2ui` layers in that order. It did not repeat
installation. Native authentication remained enabled.

Using a scripted local model adapter, 48 authenticated HTTP RPCs exercised two
sessions and three successful A2UI tool results. One synthetic action envelope
submitted over HTTP reached Session B's next turn; Session A's checked A2UI
results, user messages and turn endings stayed unchanged. One cancellation
ended as aborted without another successful authored result. Both sessions'
complete canonical event histories matched across the intended shutdown/restart,
including every event and field. No provider-request replay was observed during
the history checks and the following **0.4-second** observation window. Both host
phases exited 0 with stopped process groups; disposable authentication/state was
removed. No authentication values or raw host logs are published here.

Two earlier attempts stopped at the first turn. The first failed to retain the
underlying diagnostic, so its cause remains unknown. The second retained
`Unsupported synthetic prompt.` Source inspection and synthetic tests showed the
fixture could mistake user-role `time-context` messages for user input. Its
correction selects `source.kind === 'user'`, preserving rejection of unsupported
genuine user input. This history does not establish plugin failures or recover
the discarded request text.

This was a separately authorized native experiment. The published SDK driver
alone does not reproduce it, and the experimental rc.3 native harness is not
part of this reproducer. Existing native browser evidence uses DSH 0.2.0-rc.2.
The rc.3 run did not execute browser/client JavaScript, rendering, UI clicks or
preview withdrawal. WebSocket transport, real models, production compatibility
and marketplace eligibility remain unverified at rc.3. This is no adoption claim
and does not broaden the published compatibility ranges.
