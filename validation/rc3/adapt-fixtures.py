"""Only the reviewed rc.3 fixture adaptations; original fixture files stay intact."""
import difflib


def sdk(text):
    return text.replace("'0.2.0-rc.2'", "'0.2.1-rc.3'")


def browser(text):
    text = sdk(text).replace(
        "'lib/client.js'), 'utf8'",
        "name === 'dsh-api-gateway' ? 'lib/client.browser.js' : 'lib/client.js'), 'utf8'",
    ).replace(
        "resolve(artifact, name === 'dsh-api-gateway' ? 'lib/client.browser.js' : 'lib/client.js')",
        "resolve(artifact, 'lib/client.js')",
    )
    return text.replace(
        "['react', React]",
        "['zod', createRequire(require.resolve('@deepseek-ai/dsh-api-session-controller/package.json'))('zod')], ['react', React]",
    )


def persistence(text):
    return text.replace(
        'const {default: JsonlSessionPersistence}', 'const JsonlSessionPersistence',
    ).replace(
        "const backend = new JsonlSessionPersistence(ctx, {root, compression:'none'});",
        "await ctx.plugin(JsonlSessionPersistence, {root, compression:'none'}); const backend=ctx.sessionPersistence;",
    ).replace(
        "cold = new JsonlSessionPersistence(coldCtx, {root,compression:'none'});",
        "await coldCtx.plugin(JsonlSessionPersistence, {root,compression:'none'}); cold=coldCtx.sessionPersistence;",
    )


def ui(text):
    return text.replace(
        "resolve(dirname(require.resolve('@deepseek-ai/'+n+'/package.json')),'lib/client.js')",
        "resolve(dirname(require.resolve('@deepseek-ai/'+n+'/package.json')),n==='dsh-api-gateway'?'lib/client.browser.js':'lib/client.js')",
    ).replace(
        "['react',React]",
        "['zod',createRequire(require.resolve('@deepseek-ai/dsh-api-session-controller/package.json'))('zod')],['react',React]",
    )


def emit(source, destination, body):
    mappings = [
        ('scripts/verify-packed-host.mjs', 'compat-fixtures/host.mjs', lambda s: sdk(s).replace('ToolRuntime 0.2.0-rc.2;', 'ToolRuntime 0.2.1-rc.3;')),
        ('scripts/verify-profile-lifecycle.mjs', 'compat-fixtures/lifecycle.mjs', lambda s: s.replace('official rc.2 dependency-spec', 'official rc.3 dependency-spec')),
        ('scripts/verify-packed-persistence.mjs', 'compat-fixtures/persistence.mjs', persistence),
        ('examples/synthetic-loop.mjs', 'compat-examples/loop.mjs', browser),
        ('scripts/verify-packed-stream.mjs', 'compat-fixtures/stream.mjs', browser),
        ('test/host-ui.acceptance.tsx', 'compat-test/host-ui.acceptance.tsx', ui),
        ('vitest.host.config.ts', 'vitest.compat.config.ts', lambda s: s.replace('test/host-ui.acceptance.tsx', 'compat-test/host-ui.acceptance.tsx')),
    ]
    patches = []
    for old, new, transform in mappings:
        before = (source / old).read_text()
        after = transform(before)
        target = destination / new
        target.parent.mkdir(exist_ok=True)
        target.write_text(after)
        patches.extend(difflib.unified_diff(before.splitlines(True), after.splitlines(True), fromfile=old, tofile=new))
    prefix = (destination / 'compat-examples/loop.mjs').read_text().split('const host = new Cordis.Context();')[0]
    prefix = prefix.replace('this.requests.length <= 4', 'this.requests.length <= 6')
    (destination / 'compat-examples/two-session.mjs').write_text(prefix + body)
    return ''.join(patches)
