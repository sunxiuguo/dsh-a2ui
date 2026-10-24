# Alternatives and scope evidence

Observed 2026-10-23 UTC. These are source/documentation observations, not runtime certifications or customer demand.

- [valuz-ai/dsh-valuz-genui](https://github.com/valuz-ai/dsh-valuz-genui), 0.2.2 at `7c5f28f5c4610ef0d61d27798c0118a46e433bef`: MIT; A2UI 0.9.1, DSH >=0.2rc2<0.3, 76-component Valuz catalog, streaming, persistent metadata and action roundtrip. Its tool calls `sanitizeA2UIStream`, reporting dropped components. These capabilities mean streaming/actions/replay alone are not differentiation. Code Mode does not render a surface according to its README.
- [baihui-ai/a2ui-render-in-dsh](https://github.com/baihui-ai/a2ui-render-in-dsh): A2UI 0.9 with Ant Design X Card and a 44-component catalog; documentation targets DSH 0.1-era APIs. Current-host compatibility not tested here.
- [mantou-xia/dsh-a2ui](https://github.com/mantou-xia/dsh-a2ui): A2UI 0.9.1 beta with adapter, renderer and extensions. DSH 0.1-era compatibility documented; current-host compatibility not tested here.
- [official A2UI](https://github.com/a2ui-project/a2ui): Apache-2.0, production protocol 0.9.1 and 1.0 release candidate at observation. We reuse the official renderer and schemas instead of inventing another UI vocabulary.

Specific initial user: a DSH user already generating or receiving official basic-catalog A2UI documents, who wants to render and inspect the same payload without adopting a different component catalog. Workflow: receive messages → validate → render → interact → send action → export/reload without re-executing actions.

Evidence for building is the project owner's explicit request to offer mainstream protocol choice. We have not yet verified an external user's willingness to adopt, a paid need, or absence of equivalent features elsewhere. First validation channel is this repository's documented reproducible example and feedback from DSH/A2UI users through channels that explicitly accept project submissions; no unsolicited promotion has been sent.

Risks: upstream spec churn, DSH pre-release APIs, renderer bundle size, transport/version migration, and the cost of real-host acceptance. Do not turn a source-only comparison into a superiority or demand claim.

## AG-UI transport is a separate integration

The [tested gateway boundary](ag-ui-gateway-boundary.md) distinguishes standard A2UI document compatibility from AG-UI event, result and action wiring. The same `render_a2ui` name does not make the clients interchangeable; no combined adapter is currently provided.
