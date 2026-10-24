# Explicit form validation and runtime compatibility

## Why a valid official property can be rejected

The unchanged pinned A2UI basic catalog defines `TextField.validationRegexp` as a
string for client-side validation. In the pinned official `@a2ui/web_core` 0.14.0
runtime, TextField does not execute that property: it displays invalid state only
when `checks` resolves `isValid` to false. An accepted schema alone is therefore
not proof that a validation rule will run.

Alpha.8 deliberately rejects `TextField.validationRegexp` with a `COMPATIBILITY`
error in both v0.9 and v0.9.1 documents. The check runs after schema validation and
only on actual `updateComponents` TextField definitions. An empty string is still
an explicit unsupported property; adding `checks` alongside it does not make the
ignored property supported. Ordinary data model or action-context fields with the
same name are unaffected. An invalid property type still produces `SCHEMA`.

This boundary applies to complete documents, incremental JSONL, streamed DSH
previews, final tool execution and recording import. A rejected complete document
or appended batch is not partly applied to the renderer. Previously accepted
stream messages can remain, but a rejected component definition is not accepted.
Old recordings containing the property now fail visibly; they are not repaired or
migrated automatically. Authors must revise their source payload deliberately.

This is a temporary bridge/runtime compatibility boundary, not a change to A2UI,
a deprecation claim, a runtime fork or full basic-catalog conformance. The official
schemas, runtime versions and original payloads are not rewritten.

## Run the synthetic checks example

From the repository checkout, follow the README installation steps and run:

```sh
npm run dev
```

Open the printed loopback URL and click **Stream validation example**. The exact
standalone A2UI payload is [demo/validation-fixture.json](../demo/validation-fixture.json).
It can also be supplied as the `messages` argument to `render_a2ui` in a supported
host. The standalone page's actions go only to its local log; this example does
not book anything, contact a service, call a model or use customer data.

1. `AB12` begins valid. The field uses the standard `regex` function inside `checks`.
2. Enter `bad`: the field shows “Use two uppercase letters followed by two digits”,
   and the Button is disabled by its own explicitly authored identical check.
3. Enter `CD34`: the error clears. Click **Preview valid code** to log one action
   whose resolved context is `{ "code": "CD34" }`.
4. Export the recording and copy the JSON somewhere you can paste it back from.
   After a page reload, open the recording editor, paste that saved JSON and click
   **Restore recording**. The page does not automatically save the editor or form
   across reloads. The restored field value and validation state return; historical
   actions are not sent again.
5. Start the workshop example to replace this surface, or restart the validation
   example to reset to `AB12`. Neither starts an action automatically.

The rule in both components is:

```json
{
  "condition": {
    "call": "regex",
    "args": { "value": { "path": "/code" }, "pattern": "^[A-Z]{2}[0-9]{2}$" },
    "returnType": "boolean"
  },
  "message": "Use two uppercase letters followed by two digits"
}
```

Button checks are independent. A TextField's checks do not implicitly aggregate
into a form or disable an unrelated Button. Do not assume validation prevents a
submission unless the action component itself is explicitly gated.

This anchored string pattern is a tested authoring alternative, not an automatic
translation for every possible `validationRegexp`: the official `regex` function
has safe-pattern restrictions and authors choose the message and action gating.
Client-side checks are not authorization or a substitute for server validation.

## Verification boundary

`test/validation-compatibility.test.tsx` covers both envelope versions, empty and
nonempty unsupported properties, simultaneous checks, atomic rejection, stream
rejection, old recordings, the SDK tool and host projection. Positive renderer
tests cover input changes, streamed model updates, action values and replay; a
negative control preserves field-only validation semantics.

`browser-tests/validation.spec.ts` exercises the demo button, invalid and valid
input, replay, switching/resetting examples and visible rejection of an old
recording. Browser test discovery is not execution: use the exact-commit CI result
before claiming Chrome acceptance. jsdom tests use the real pinned renderer but
do not certify browser layout, accessibility, a full DSH shell or a live model.
