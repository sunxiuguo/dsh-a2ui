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
Native CLI/full host, authentication, HTTP/WebSocket transport, visual layout,
real models and production compatibility remain untested at rc.3. This is no
adoption claim and does not broaden the published compatibility ranges.

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
