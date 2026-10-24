import assert from 'node:assert/strict';
import {isAbsolute} from 'node:path';

// Generates a normal CLI --patch layer. No host creation or credential access.
// Rows are verified against official DSH commit 639ed015397290b3745d163aafe02ffee4aa3f84.
export function makeOverlay({providerPath, documentsDirectory, persistenceRoot}) {
  for (const path of [providerPath, documentsDirectory, persistenceRoot]) assert.ok(isAbsolute(path));
  const quote = JSON.stringify;
  return `# Test-only local provider; native DSH shell, auth, RPC, mux and persistence remain intact.
- id: hmr
  disabled: true
- id: llm-deepseek
  disabled: true
- id: llm-deepseek-account
  disabled: true
- id: llm-pi-ai
  disabled: true
- id: session-title-llm
  disabled: true
- id: session-telemetry-otel
  disabled: true
- id: session-log-deepseek
  config:
    enabled: false
- id: ui-plugin-manager
  config:
    registryProbeEnabled: false
- id: agent-default-model
  config:
    provider: a2ui-synthetic
    model: workshop
- id: agent-preset-registry
  config:
    default: standard
- id: session-persistence-jsonl
  config:
    root: ${quote(persistenceRoot)}
- id: workspace-controller
  config:
    documentsDirectory: ${quote(documentsDirectory)}
- id: directory-picker
  disabled: true
- id: open-in-app
  disabled: true
- id: ui-open-in-app
  disabled: true
- insert:
    - id: directory-picker-browse
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: ui-directory-picker-browse
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
    - id: dsh-a2ui-synthetic-provider
      name: ${quote(providerPath)}
`;
}
