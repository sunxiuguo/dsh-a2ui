# Stable basic-catalog contract coverage

Pinned specification: A2UI v0.9.1, official source recorded in `vendor/a2ui`.
The catalog contains 18 components and 14 functions. `test/catalog-contract.test.ts`
requires one explicit synthetic fixture per catalog entry so upstream additions
cannot silently count as covered.

## What is exercised

- All 15 currently permitted components: minimal valid schema, complete-reference
  document validation, and rejection of an unknown component property.
- Image, Video and AudioPlayer: explicit deployment-policy rejection. These are
  standard components; rejection is not a protocol limitation or removal from the
  long-term scope.
- All 13 currently permitted functions: valid argument shape and invalid argument
  rejection inside an actual component's dynamic value.
- openUrl: explicit deployment-policy rejection, not an unsupported standard.

These 62 tests establish contract acceptance/rejection only. They do not establish
full rendering, semantic function correctness, accessibility, date/locale behavior,
all variants, user interaction, cross-renderer parity or live DSH compatibility.
The separate surface tests exercise a synthetic TextField/Button action and replay
in jsdom; they must not be extrapolated to every component.

## Next acceptance layers

1. Real Chromium interaction for all input components, tabs and modal, with sandbox
   enabled and only synthetic data.
2. Function-result and bound-value semantics, including validation failures and
   locale/date edge cases.
3. Supported isolated DSH host: install, live streaming, action to model turn,
   cancellation, failed delivery and reload.
4. Explicit host-managed resource/navigation policy before lifting the initial
   restrictions. Never silently enable remote loads or navigation.

## Function evaluation increment (2026-10-23)

An additional 23 tests now evaluate all 13 permitted functions through the pinned
vendor's DataContext attached to a bridge-created surface, rather than merely
validating JSON shapes. Cases include empty/zero required values, positive/negative
validation, inclusive numeric/length bounds, explicit number precision, USD
formatting, offset-preserving calendar fields, an invalid calendar date, plural
selection, boolean combinations, and nested path-bound functions after a streamed
model update and portable replay. The formatting assertions describe the pinned
catalog's default English locale; they are not multi-locale conformance.

A second Playwright scenario is prepared for CheckBox, Slider, DateTimeInput and
ChoicePicker edits, a resolved action, and fresh-page replay without resending.
Test discovery is not browser execution. Its exact-commit CI result must be checked
before claiming these additional controls have passed real-browser acceptance.

The full DSH launcher 0.2.0-rc.2 brings the base, Web and other profile packages;
the SDK dependencies already present here are not a complete installation. No live
DSH-host acceptance is claimed. Full catalog variants, reactive subscriptions,
locale combinations, accessibility and host failure/cancellation remain open.

## Navigation and visible-selection increment

The pending navigation browser scenario exercises a synthetic Tabs → Modal →
TextField → action workflow: edit, close without sending, reopen, send once,
switch tabs to unmount/remount the modal, export, reload and replay without
resending. Bound form data is expected to survive; transient active-tab and modal
open state intentionally restart at their default state. This is not a claim of
keyboard/focus accessibility or Escape-key support. The control scenario also
asserts the restored ChoicePicker's visible radio selection, not only stored data.
These additional assertions require their own successful exact-commit browser CI;
test discovery alone is not acceptance.
