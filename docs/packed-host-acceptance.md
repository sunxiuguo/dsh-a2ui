# Packed server-service acceptance

This checks the npm-packed server entry against real Cordis 4.0.5 and DSH
SystemPrompt / ToolRuntime 0.2.0-rc.2 services. It replaces the synthetic registry
boundary for this check, not the full DSH application boundary.

After installing the locked dependencies, run from the repository root:

```sh
npm run build:plugin
tmp=$(mktemp -d "$PWD/.host-acceptance.XXXXXX")
npm pack --ignore-scripts --pack-destination "$tmp"
tar -xzf "$tmp/dsh-a2ui-0.1.0-alpha.1.tgz" -C "$tmp"
node scripts/verify-packed-host.mjs "$tmp/package"
```

Keep the extracted package under the repository so its peer dependencies resolve
from the existing locked `node_modules`; no separate installation is needed.
The temporary directory is disposable synthetic build output.

The script imports the package's actual built entry, mounts it via Cordis,
dispatches through the official runtime, and asserts frozen successful metadata,
the honest text fallback, rejected invalid and pre-dispatch cancelled calls, removal on plugin
unload, and successful remount. It disposes the root fiber in `finally`.
It uses only synthetic text and does not connect a model, browser, account,
credentials, network service or production profile. It does not disable host
policy or substitute a tool registry. The direct caller is agent-less.

Observed on 2026-10-23 against source commit
`ce5c45d6dc134a15fe7756fe2e0e66bd96bf5ca5`, Node 24.19.0: all assertions passed.
This establishes the packed server/service lifecycle and result contract. It does
**not** establish profile bundle installation, client injection, streaming in a
live DSH UI, click-to-model turns, durable sessions or full host cancellation.
Those remain required before claiming complete DSH host acceptance.
