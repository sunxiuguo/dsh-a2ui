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
