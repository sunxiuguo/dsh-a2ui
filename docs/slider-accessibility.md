# Slider: named keyboard editing, numeric actions and replay

A generated adjustment form needs a discoverable native slider, keyboard editing,
a numeric submitted value and a non-executing restored view. The pinned official
`@a2ui/web_core` 0.14.0 Slider displays its label as a separate span; a generic
host accessibility label does not name the inner range input. This is reported
in [A2UI #3498](https://github.com/a2ui-project/a2ui/issues/3498).

The plugin-owned Slider presentation uses the same public universal Web Component
and catalog extension APIs as the TextField adaptation. It keeps the official
schema, generic binder, numeric `setValue`, checks, catalog identity and functions.
There is no vendor edit, private import, storage or network behavior.

## Exact compatibility contract

- A visible label is associated with the native range input. Explicit standard
  accessibility labels take accessible-name precedence. Descriptions and check
  errors describe the control, not just its surrounding component.
- Labels and values remain reactive. Independently rendered references receive
  distinct native-control identifiers, even when component IDs are reused.
- Supported protocols are v0.9 and v0.9.1. Neither schema accepts `step` or `steps`.
  The native range keeps its default step of 1; this is not v1.0 stepped-slider
  support. No schema is broadened and no payload is silently rewritten.
- Official update semantics retain omitted properties. Explicit `checks: []` and
  `accessibility: {}` clear those values; omission is not a reset.
- Native input events write numbers through the official binder. Explicit Button
  actions resolve the current model, and portable replay never resends historical
  actions. Field checks do not implicitly gate unrelated Buttons.
- Native HTML may sanitize decimal or out-of-range authored values differently
  from the unchanged authored model before input. This inherited behavior is not
  repaired by the accessibility view. Authors should supply an in-range value
  aligned to the native step of 1 relative to `min`. Full numeric conformance remains open.

## Verification boundary

The focused comparison uses the unchanged official view as a negative control.
The browser scenario uses native role/name queries, label activation, Arrow keys,
Home/End limits, dynamic renaming, two surfaces, a numeric action and
export/reload/replay without duplicate actions. Check exact-commit CI for actual
browser execution. Synthetic tests do not establish adoption, all assistive
technology support, mobile gestures or WCAG certification.

The earlier alpha.8 native DSH shell/restart evidence remains separate. This
change does not repeat its completed one-time credential-bearing acceptance.
