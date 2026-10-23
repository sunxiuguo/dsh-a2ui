# Verification ledger

Environment: isolated cloud workspace, Node 24.19.0. Synthetic data only.

- Protocol fixture tests exercise strict schema rejection, lifecycle, topology, fragmented JSONL and non-executing replay.
- SDK typechecking targets DSH 0.2.0-rc.2 and Cordis 4.0.5.
- Browser-like component tests use jsdom 26.1.0. Constructable stylesheet `replaceSync` is shimmed because jsdom lacks layout support. These tests do not certify styling, browser security boundaries or a live DSH host.
- Vite builds produce standalone preview and plugin entries. A successful bundle is not an installation result.

Outstanding before production readiness: real Chrome visual/input test; isolated DSH installation and full interaction/reload test; host permission and Code Mode behavior; complete stable-catalog and function conformance; independent security review.

Commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run build:plugin`.

Use exact source commit and observed results from a release's notes; do not treat this checklist as proof those commands passed on a later revision.
