# Literal data and executable expressions

A generated catalog-documentation form may legitimately edit and submit metadata
such as `{"component":"Image","call":"openUrl"}`. These words do not by themselves
create a media component or request navigation. Earlier bridge policy scanned all
JSON objects as if they were executable definitions: a valid blank form could be
edited to this record, then fail to submit and fail to export its snapshot.

## Positions and unchanged restrictions

- `updateDataModel.value` and resolved outgoing action context are data. Ordinary
  path bindings return their objects/arrays without recursively executing them.
  They retain their exact wire shape; no key renaming, encoding or rewriting is
  performed.
- Authored component definitions and their nested dynamic values remain subject
  to the conservative media/navigation scan. Actual Image, Video and AudioPlayer
  definitions remain disabled. Direct `openUrl` expressions, including nested
  inline arrays, checks, function arguments and authored event context, remain
  rejected. Even a literal-looking inline event-context map is conservatively
  scanned: the pinned processor can mistake a `call` field there for an expression.
  Bind the desired data from a model path instead. This is not a complete
  schema-derived expression walker.
- Global dangerous-key, unsafe-path, nesting, size, action budget, lifecycle,
  topology, catalog and protocol-version checks remain in place even for data.
- A path-returned object is not the same as an authored inline expression.
  In particular, `formatString` deliberately parses string contents into new
  expressions, including strings supplied by a model path or changed by a user.

## Deny navigation at execution too

The renderer catalog retains the official `OpenUrlApi` schema and replaces only
its implementation through the public catalog extension API with a deny-only
implementation. Direct, nested and formatString-generated calls therefore cannot
reach the original navigation implementation. No remote resources or navigation
are enabled by permitting literal metadata.

The official evaluator catches an execution denial and emits an expression error;
formatted output can be empty. This is not necessarily an atomic document/import
rejection or a `SurfaceSession.lastError` alert. It does not abort an enclosing
ordinary event: a denied nested expression may produce an empty/undefined value
while that event proceeds. No claim of atomic expression failure is made. Static prohibited expressions
continue to fail the earlier policy check. Benign formatting can recover after a
model edit. The runtime backstop is separate from wire-schema validation.

## Workflow and acceptance

Synthetic tests use the actual official processor/binder: edit metadata, submit
its numeric/string/object values, export, restore and retain history without
resending recorded actions. Adversarial tests cover inline expression arrays,
model-derived templates, nested function arguments and restored snapshots using
only deny/stub navigation hooks, never a real navigation attempt.

The browser tests block non-loopback requests and replace `window.open` with a
record-only hook. Exact-commit CI, not test discovery, establishes browser results.
No live model, new account, credential, persistent storage or full-host acceptance
is introduced. Complete protocol support and a general security certification are
not claimed. The existing renamed-key or JSON-string workarounds remain valid,
but are no longer required for ordinary literal model/event data.
