# Clearing a combined date and time

Alpha.13 replaces only the presentation of the pinned official DateTimeInput
through the public catalog extension API. It retains the official schema, binder,
validation functions and nonempty editing behavior.

## The corrected workflow

Previously, clearing one native control in a combined date/time selection could
write `T14:30:00` or `2026-10-24T:00` to the data model. These malformed strings
are nonempty, so the standard `required` function considered them present. An
action could send them and a portable recording could preserve them.

Clearing either control now clears the complete bound selection to `''`. After
the binding update both controls are empty. This is an atomic clear, not partial
draft storage. An author-supplied `required` check now observes an absent value.
Field checks do not implicitly gate another component: authors must also put the
appropriate checks on the submitting Button. An unchecked Button may still send
an empty value, as before; this fix adds no global action policy.

Export/import retains the empty model value and restores empty controls without
resending historical actions. Date-first entry from empty retains the pinned
renderer’s midnight default; time-first entry retains its current local-date
default. Subsequent complete edits and action/replay use that selected value.

## Evidence and limits

Synthetic component regressions exercise v0.9 and v0.9.1, clearing either half,
explicit required gating, unchecked empty submission, repeated clearing/refill,
nested binding and streamed replacement. Independent checks cover preserved host
accessibility, leap-day input and existing date-edit offset/seconds behavior.
The real-browser acceptance file `browser-tests/datetime-clear.spec.ts` exercises
both versions and both controls through clear, export, fresh-page restoration,
refill, submit and restoration without resend. Its execution result belongs to
its exact published commit, not to test discovery.

This is not a comprehensive date parser, timezone conversion, accessibility
certification, or a live-model/full-host acceptance run. Display normalization
and nonempty edits deliberately retain the pinned runtime’s behavior, including
minute display precision and time edits producing `:00`. Merely rendering or
restoring a value does not normalize its stored representation. Arbitrary
malformed authored model strings and all locale/calendar combinations remain
outside this fix. No new dependency, schema change, navigation or storage
permission is introduced.
