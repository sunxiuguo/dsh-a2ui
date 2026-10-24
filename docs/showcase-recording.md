# Reproduce the synthetic showcase video

This records the actual standalone browser UI continuously, using the pinned
Playwright package and installed Chrome. It is not a live model, a full DSH host,
a production conversation, or evidence of external adoption. No frame replacement
or invented UI is used. The form uses synthetic values only.

After `npm ci --ignore-scripts`, install the official Playwright video encoder
with `npx --no-install playwright install ffmpeg`. Start `npm run dev -- --port
4173 --strictPort`, then run `node scripts/record-showcase.mjs` from the repository
root. The script keeps the browser sandbox enabled and blocks HTTP requests outside
that exact loopback origin. It does not require account or model credentials.

The sequence shows valid and invalid explicit checks, one local action, export,
actual page reload, explicit paste and restore without resending historical
actions. It then shows the rejected `TextField.validationRegexp` compatibility
boundary without replacing the prior valid surface. This is not automatic draft
persistence or implementation of that unsupported property.

Successful output is `showcase-video/dsh-a2ui-synthetic-demo.webm` plus a synthetic
receipt. Inspect the actual video, confirm it is below four minutes, and label its
source commit and limitations before sharing. A passing script alone does not
prove visual legibility or recipient access. An Actions artifact is temporary and
may require GitHub login; it is not automatically a publicly accessible showcase
link. The existing acceptance workflow records only on master pushes and uploads
only the named video and receipt, retained for seven days, with no added token
permissions. No logs, traces, environment files, or browser profiles are uploaded.
