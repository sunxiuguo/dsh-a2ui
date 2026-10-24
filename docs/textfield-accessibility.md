# TextField names and label interaction

Alpha.9 supplies a plugin-owned Web Component for the standard TextField component.
It uses the public `Catalog.withEntries()` and
`A2uiLitElement`/`WebComponentImplementation` APIs. The catalog identifier,
official component schema, generic reactive binder, data model and function
implementations remain unchanged. The existing pinned `lit` 3.3.3 runtime is now a direct dependency; it is not
upgraded. Alpha.10 also adapts Slider; see [its focused scope](slider-accessibility.md). Other components keep their pinned official views. This is a focused presentation adaptation, not a fork of A2UI or a claim
that the complete catalog is accessible.

## User task and existing alternative

A person completing a generated form needs to discover its native input by name,
activate its visible label, edit it, and submit the intended value. The pinned
`@a2ui/web_core` 0.14.0 TextField draws a visible label next to its input but does
not programmatically associate the two. Adding the standard accessibility label
to the generic component host does not name the inner native input. The previous
browser acceptance used component/tag selectors and therefore did not establish
accessible naming.

This is also reported upstream in [issue #3498](https://github.com/a2ui-project/a2ui/issues/3498).
Existing [accessibility work #1410](https://github.com/a2ui-project/a2ui/issues/1410)
is maintained upstream. This project does not claim that issue or submit a
competing upstream change. Moving to an unverified dependency version is not a
substitute for testing the currently pinned native-control behavior.

## Compatibility boundary

- The visible label is associated with the native input or textarea. Clicking it
  focuses that control, including when different surfaces reuse component IDs.
- An explicit standard accessibility label takes precedence as the accessible
  name. It does not erase the visible label.
- Short text, long text, number and obscured variants keep their native input
  types and official value-binding behavior.
- Data-bound labels and values react to model changes. Portable replay restores
  the authored model/snapshots without dispatching historical actions.
- Existing explicit checks, error messages and independently gated Buttons keep
  their prior semantics. This does not enable `validationRegexp`, which remains
  an explicit compatibility rejection.
- No implicit draft storage, network access, account or credential behavior is
  added. No protocol payload or vendor package is rewritten.

## Verification and remaining scope

The focused tests compare the unmodified official view against the replacement
using the same real processor/binder. Existing surface, validation and packed
host-slot tests remain separate regression checks. The browser scenario uses
role/name queries, label focus, all four variants, overlapping component IDs,
dynamic labels and export/reload/replay. Consult exact-commit CI for browser
execution rather than treating test discovery as success.

This is not an audit with every screen reader or a WCAG certification. Slider has [separate focused coverage](slider-accessibility.md);
DateTimeInput, ChoicePicker, focus order across dialogs, keyboard navigation,
locale combinations and complete catalog accessibility remain separate work.
The full native DSH shell/restart result remains the earlier alpha.8 evidence;
alpha.9 does not silently repeat that one-time credential-bearing test.
