# Third-party notices

Official A2UI schema JSON files in `vendor/a2ui` are unmodified from a2ui-project/a2ui commit `020a9d6f694761ad16b35bc38945e4ccd0ac14e8`, `specification/v0_9_1`. Copyright Google LLC and A2UI contributors; Apache-2.0; full license adjacent. Runtime schema alias registration is project code, not an upstream schema modification.

Official `@a2ui/react`, `@a2ui/web_core`, and `@a2ui/markdown-it` are Apache-2.0 dependencies. Their distributed copyright notices and licenses remain in installed packages. Full license texts for all runtime dependencies are retained under `vendor/runtime-licenses`, with package versions, source repositories and SHA-256 hashes in `INDEX.json`. The build checks every bundled npm module against this inventory and copies the full texts into each output alongside `bundled-dependencies.json`. The inventory conservatively includes some packages that are external or tree-shaken. The published Lit SSR shim omits a full license file; its official monorepo BSD license is retained from Git blob `428e3385849054f8e0657b86d7ede515ea6e8c33`.

The DSH conversation-node integration was informed by the MIT-licensed valuz-ai/dsh-valuz-genui v0.2.2 source at `7c5f28f5c4610ef0d61d27798c0118a46e433bef`. Its license is retained in `vendor/valuz/LICENSE`. No claim of original invention is made for DSH event/slot integration patterns. Valuz runtime code and catalog are not dependencies of this project.

The test-only full-host helpers in `scripts/full-host` adapt selector and RPC patterns from DeepSeek Harness `639ed015397290b3745d163aafe02ffee4aa3f84` (MIT, copyright 2026 DeepSeek). The full MIT notice is retained in `scripts/full-host/LICENSE.deepseek`. These helpers are not part of the runtime plugin bundle.
