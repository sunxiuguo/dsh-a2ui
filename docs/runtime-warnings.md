# Observed runtime warnings

The official renderer can report an evaluation error while leaving a binding
empty. `SurfaceSession` listens to each active surface's public `onError` source
and `SurfaceView` displays one dismissible alert immediately before that surface.

The fixed message is:

> Runtime warning observed. Some content may be unavailable. Dismissing this
> notice does not confirm recovery.

The button is named **Dismiss runtime warning**. No runtime message, expression,
code, details, component name, or surface ID is copied into the alert. The bridge
does not keep a raw error log. It stores only an observed/not-observed flag per
active surface, bounded by the existing eight-surface document limit.

## Semantics and lifecycle

- `hasRuntimeWarning(surfaceId)` reads that flag for the current surface instance.
  `dismissRuntimeWarning(surfaceId)` clears it. A later emitted error can show the
  notice again; dismissal does not force re-evaluation or prove recovery.
- This is an **observed warning**, not a diagnosis that every component is broken
  or that an error is still active. A good data edit or successful action does
  not automatically clear it: the pinned runtime supplies no matching recovery
  event or stable component/property identity for these errors.
- Runtime notices are independent of `lastError`, which reports action delivery
  and validation failures. A notice does not block or abort an action. Existing
  expression fallback behavior remains: an action may still send with an empty
  or omitted result when the renderer reports an expression failure.
- The constructor installs creation/deletion listeners before append, restore,
  and rendering. Error subscriptions belong to the actual surface instance, not
  merely its ID. Delete/recreate clears the old state; unrelated surfaces keep
  their own notices. Repeated errors while a notice is visible are coalesced.
- Flags update synchronously, while UI notifications are coalesced in a
  microtask so a renderer's synchronous error does not update its React parent
  during render. The official event emitter awaits each listener, so external
  creation/error observers can run after synchronous append or restore returns.
  Consumers should await their event rather than assume same-stack delivery.
  Disposal removes the bridge's subscriptions and drops pending
  notifications; it does not depend on processor disposal to remove them.

## Export and replay boundary

Flags and dismissals are transient UI state. They are not added to authored
messages, model snapshots, actions, recordings, or host persistence. Restoring a
recording does not restore a notice or send historical actions. If the restored
content evaluates and emits a new error, that new observation can show a notice.
Normal authored content and model data remain exportable exactly as before; this
feature does not claim to redact those fields or alter upstream diagnostics.

No protocol validation, catalog membership, navigation restriction, action
budget, or transport policy changes. This feature does not add a recovery API,
component-level diagnosis, atomic runtime-error rejection, or a full error log.

## Verification

`test/runtime-warnings.test.tsx` exercises the pinned official evaluator and
React renderer with synthetic fixtures for both v0.9 and v0.9.1. It covers initial
and pre-mount failures, malformed expressions, denied navigation, fixed text,
repeat/dismiss/recur behavior, action independence, deletion/recreation, disposal,
and export/replay. Navigation and network executors are guarded. These jsdom
checks do not establish real-browser styling or full-host acceptance.
