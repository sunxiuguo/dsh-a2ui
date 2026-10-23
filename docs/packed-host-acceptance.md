# Packed profile and client-module acceptance

Run after `npm ci --ignore-scripts`:

```sh
npm run build:plugin
npm run test:packed
```

The command packs the actual npm artifact, extracts it under a unique temporary
repository directory so locked peers resolve, and runs service, profile and scoped UI
checks. It removes its own temporary output in `finally`. It requires Node 24.19.0,
`npm` and `tar`, as provided by the Linux CI job. It neither installs a user profile
nor modifies the real Harness home. No credentials, model, network calls or
production data are used. A synthetic `.invalid` URL is an in-memory Request key,
not an outgoing request.

## Regression fixed in alpha.2

Alpha.1’s built `lib/client.js` was ESM with a relative shared chunk. The DSH
0.2.0-rc.2 browser host consumes classic scripts that register lazy CJS factories.
The official host-served/loader chain rejected alpha.1 with
`Cannot use import statement outside a module`; standalone Vite tests did not
exercise this boundary. Alpha.2 builds the server as ESM and the client as one
self-contained CJS factory registered under `dsh-a2ui`. React remains a host
singleton. Side effects stay inside the lazy factory.

## Regression fixed in alpha.3

The rc.2 `conversation.chat.node` keyed slot passes a `node` whose payload is
`node.data`. The previous client expected top-level `data`, so the real slot
renderer crashed reading `messages`. The client now accepts the SDK's
`ChatNodeViewProps<'a2ui-document'>` rather than an invented props shape.
The new fixture fails against the previous artifact and passes with this fix.

## What the checks actually establish

- Packed server entry mounts through real Cordis 4.0.5 / DSH ToolRuntime rc.2;
  canonical output metadata is frozen, invalid and pre-dispatch cancelled calls
  have no successful metadata, unload removes the tool and remount works.
- A synthetic profile places the extracted package with a local symlink, then
  uses real `reconcileProfilePlugins`, `loadProfileDirectory` and `boot`.
  Bundle auto-activation and the actual plugin’s ACTIVE state are asserted,
  without compatibility exemptions or a substitute registry.
- The actual `ClientModuleRegistry` discovers the installed package and serves
  its artifact. Official `bootInjections` builds the queue; the real rc.2 browser
  module system runs in jsdom’s outside-only VM. Prefetch must remain lazy;
  import must expose the client plugin; `/client` reimport must reuse exports;
  recorded require edges must be only React baseline modules.

- The extracted client runs in the actual rc.2 SlotRegistry/React renderer,
  UiSession adapter, ClientSessions, UiConversation event assembler and
  ConversationController. Synthetic tool-call/result events produce the slot
  node. Two retained sessions render the same independent example; a click in B
  reaches B's `Session.prompt`, while a rejected A send shows A's error only and
  is not retried. The transport records the untrusted-data action envelope.
- This UI fixture uses a minimal synthetic root and chat target projection,
  captured official browser factories and a synthetic remote transport. Unused
  composer primitives are a fail-closed sentinel, not simulated UI services.
  The separate profile fixture tests the official module loader. Neither fixture
  claims the full chat/composer app, CSS layout or an actual server/model.

Observed 2026-10-23: old alpha.1 artifact fails this real loader path; corrected
artifact passes. The same checks are now part of the existing CI acceptance job.
The server-only proof originally landed at `f5d01c6`; this expands its boundary.

## Still unverified

This is not a real DSH CLI or package-manager install. Profile placement
is synthetic and jsdom is not a browser-rendered DSH shell. Complete DSH shell/composer
activation, live streaming/click-to-model turns, session persistence,
full host cancellation and production deployment remain separate acceptance
requirements. Do not infer user adoption, full protocol coverage or revenue.
