#!/usr/bin/env python3
"""Bounded rc.3 SDK validation of the unchanged immutable alpha.13 artifact."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

HERE = Path(__file__).resolve().parent
COMMIT = 'bbb205aa5f3363c654dd23d23008e5c40b6c31ef'
SOURCE_SHA = '088675c818685fa8bd0a8d8268d7780c4a6463ff8953e84cfc3818736a0cdf6c'
ARTIFACT_SHA = 'e443574896684a5140edc6d6394923b71fdc2a95398cf76b7bcd179eabd5ddef'
LOCK_SHA = '8e8fd9380e32d3b54623b59f64d093c0c3b59b4a7653942a4355e874667a90a5'
BASE_LOCK_SHA = '9871abbd72d3f6a7ca7f3218bdad4f40c526d23a1ba5bc332ce28e06a2314f6a'
INPUTS = ('validate-rc3.py', 'adapt-fixtures.py', 'runtime-versions.mjs',
          'test-guards.py', 'two-session-body.mjs', 'pnpm-lock.yaml',
          'official-packages.json', 'fixture-adaptations.patch', 'README.md', 'NOTICE.md')
OFFICIAL = ('dsh-agent-loop', 'dsh-api-session-controller', 'dsh-app-boot',
            'dsh-client-modules', 'dsh-client-store', 'dsh-client-ui-chat',
            'dsh-client-ui-conversation', 'dsh-client-ui-renderer',
            'dsh-client-ui-session', 'dsh-client-ui-slots',
            'dsh-session-persistence-jsonl', 'dsh-session-query', 'dsh-tools',
            'dsh', 'dsh-plugin-manager', 'dsh-agent', 'dsh-llm', 'dsh-session',
            'dsh-session-projection', 'dsh-system-prompt', 'dsh-api-gateway',
            'dsh-client-ui-primitives')
EXTRAS = ('dsh-agent', 'dsh-llm', 'dsh-session', 'dsh-session-projection',
          'dsh-system-prompt', 'dsh-api-gateway', 'dsh-client-ui-primitives')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def verify_inputs(bundle):
    records = {}
    for line in (bundle / 'SHA256SUMS').read_text().splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  ([A-Za-z0-9_.-]+)', line)
        require(match is not None, 'INPUT_INVENTORY: malformed checksum record')
        checksum, name = match.groups()
        require(name not in records, 'INPUT_INVENTORY: duplicate ' + name)
        records[name] = checksum
    require(set(records) == set(INPUTS), 'INPUT_INVENTORY: missing or unexpected file')
    for name, checksum in records.items():
        require((bundle / name).is_file() and not (bundle / name).is_symlink(), 'INPUT_FILE: ' + name)
        require(digest(bundle / name) == checksum, 'INPUT_CHECKSUM: ' + name)
    require(digest(bundle / 'pnpm-lock.yaml') == LOCK_SHA, 'LOCK_CHECKSUM: frozen baseline changed')
    rows = json.loads((bundle / 'official-packages.json').read_text())
    expected = {'@deepseek-ai/' + name for name in OFFICIAL}
    require(isinstance(rows, list) and len(rows) == len(expected), 'PACKAGE_INVENTORY: count')
    seen = set()
    for row in rows:
        require(isinstance(row, dict) and set(row) == {'name', 'version', 'sha256'}, 'PACKAGE_INVENTORY: fields')
        require(row['name'] in expected and row['name'] not in seen, 'PACKAGE_INVENTORY: unexpected or duplicate name')
        require(row['version'] == '0.2.1-rc.3', 'PACKAGE_INVENTORY: version')
        require(re.fullmatch(r'[0-9a-f]{64}', row['sha256']) is not None, 'PACKAGE_INVENTORY: checksum')
        seen.add(row['name'])
    require(seen == expected, 'PACKAGE_INVENTORY: incomplete')
    return rows


def fetch(url, target):
    with urllib.request.urlopen(url, timeout=30) as response:
        target.write_bytes(response.read())


def verify_packages(rows, cache, offline):
    cache.mkdir(parents=True, exist_ok=True)
    for row in rows:
        name = row['name'].split('/')[1]
        filename = name + '-0.2.1-rc.3.tgz'
        archive = cache / filename
        if not archive.exists():
            require(not offline, 'PACKAGE_MISSING: ' + filename)
            fetch('https://registry.npmjs.org/@deepseek-ai/' + name + '/-/' + filename, archive)
        require(digest(archive) == row['sha256'], 'PACKAGE_CHECKSUM: ' + name)
        with tarfile.open(archive) as packed:
            manifest = json.load(packed.extractfile('package/package.json'))
        require(manifest['name'] == row['name'] and manifest['version'] == row['version'], 'PACKAGE_IDENTITY: ' + name)
        require(manifest.get('repository', {}).get('url') == 'git+https://github.com/deepseek-ai/deepseek-harness.git', 'PACKAGE_SOURCE: ' + name)
        scripts = manifest.get('scripts', {})
        lifecycle = {'preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'prepack', 'postpack'}
        require(not lifecycle.intersection(scripts), 'PACKAGE_LIFECYCLE: ' + name)


def verify_source(archive, source, root):
    require(digest(archive) == SOURCE_SHA, 'SOURCE_CHECKSUM')
    with tarfile.open(archive) as packed:
        prefix = 'dsh-a2ui-' + COMMIT + '/'
        if source is None:
            packed.extractall(root, filter='data')
            source = root / prefix.rstrip('/')
        members = [m for m in packed.getmembers() if m.isfile()]
        require(len(members) == 143, 'SOURCE_INVENTORY')
        for member in members:
            require(member.name.startswith(prefix), 'SOURCE_PATH')
            require((source / member.name[len(prefix):]).read_bytes() == packed.extractfile(member).read(), 'SOURCE_FILE: ' + member.name)
    require(digest(source / 'package-lock.json') == BASE_LOCK_SHA, 'SOURCE_LOCK_CHECKSUM')
    return source, json.loads((source / 'package.json').read_text())


def verify_artifact(archive, original, installed=None):
    require(digest(archive) == ARTIFACT_SHA, 'ARTIFACT_CHECKSUM')
    with tarfile.open(archive) as packed:
        require(json.load(packed.extractfile('package/package.json')) == original, 'ARTIFACT_MANIFEST')
        if installed is not None:
            require(json.loads((installed / 'package.json').read_text()) == original, 'INSTALLED_MANIFEST')
            for member in packed.getmembers():
                if member.isfile():
                    relative = member.name.removeprefix('package/')
                    require((installed / relative).read_bytes() == packed.extractfile(member).read(), 'INSTALLED_BYTES: ' + relative)


def environment(root):
    keys = ('PATH', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
            'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
            'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR')
    env = {key: os.environ[key] for key in keys if key in os.environ}
    for kind in ('user', 'global'):
        (root / (kind + '.npmrc')).write_text('')
    env.update(NPM_CONFIG_USERCONFIG=str(root / 'user.npmrc'), NPM_CONFIG_GLOBALCONFIG=str(root / 'global.npmrc'),
               NPM_CONFIG_CACHE=str(root / 'npm-cache'), NPM_CONFIG_REGISTRY='https://registry.npmjs.org',
               XDG_CONFIG_HOME=str(root / 'config'), XDG_DATA_HOME=str(root / 'data'), XDG_CACHE_HOME=str(root / 'cache'),
               PNPM_HOME=str(root / 'pnpm'), TMPDIR=str(root), CI='true', PYTHONDONTWRITEBYTECODE='1')
    return env


def consumer_manifest(original):
    deps = {name: '4.0.5' if name == '@deepseek-ai/cordis' else '0.2.1-rc.3' for name in original['peerDependencies']}
    deps['dsh-a2ui'] = 'file:../dsh-a2ui-0.1.0-alpha.13.tgz'
    dev = {**original['dependencies'], **original['devDependencies']}
    for name in list(dev):
        if name.startswith('@deepseek-ai/dsh-'):
            dev[name] = '0.2.1-rc.3'
    dev.update({'@deepseek-ai/' + name: '0.2.1-rc.3' for name in EXTRAS})
    for name in deps:
        dev.pop(name, None)
    return dict(name='synthetic-rc3-consumer', version='0.0.0', private=True, dependencies=deps, devDependencies=dev)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('bundle', 'source-archive', 'source', 'artifact', 'consumer', 'package-cache'):
        parser.add_argument('--' + name, type=Path)
    parser.add_argument('--offline', action='store_true', help='Require local prepared inputs; never install or download')
    parser.add_argument('--check-only', action='store_true', help='Stop after all provenance and runtime-resolution guards')
    parser.add_argument('--npm-counterexample', action='store_true', help='Opt in to reproducing the known npm peer failure')
    args = parser.parse_args(argv)
    bundle = (args.bundle or HERE).resolve()
    rows = verify_inputs(bundle)
    root = Path(tempfile.mkdtemp(prefix='dsh-rc3-validation-', dir='/tmp'))
    env = environment(root)
    results = []

    def run(cwd, label, command, expected=0, extra=None):
        with (root / (label + '.log')).open('w') as output:
            process = subprocess.run(command, cwd=cwd, env={**env, **(extra or {})}, stdout=output, stderr=subprocess.STDOUT, timeout=180)
        results.append(dict(label=label, argv=command, exitCode=process.returncode))
        (root / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
        print(label, process.returncode, flush=True)
        require(process.returncode == expected, label + ': ' + (root / (label + '.log')).read_text())

    for command, expected in ((['node', '--version'], 'v24.19.0'), (['npm', '--version'], '11.9.0'), (['pnpm', '--version'], '11.19.0')):
        actual = subprocess.check_output(command, env=env, text=True).strip()
        require(actual == expected, 'TOOL_VERSION: ' + command[0] + ': ' + actual)
    verify_packages(rows, args.package_cache or root / 'packages', args.offline)
    archive = args.source_archive or root / 'source.tar.gz'
    if not archive.exists():
        require(not args.offline, 'SOURCE_MISSING')
        fetch('https://codeload.github.com/sunxiuguo/dsh-a2ui/tar.gz/' + COMMIT, archive)
    source, original = verify_source(archive, args.source, root)
    artifact = args.artifact
    if artifact is None:
        require(not args.offline, 'ARTIFACT_MISSING')
        build = root / 'baseline-build'
        shutil.copytree(source, build)
        run(build, 'baseline-ci', ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--fetch-retries=0'])
        run(build, 'baseline-build', ['npm', 'run', 'build:plugin'])
        run(build, 'baseline-pack', ['npm', 'pack', '--ignore-scripts', '--pack-destination', str(root)])
        artifact = root / 'dsh-a2ui-0.1.0-alpha.13.tgz'
    verify_artifact(artifact, original)
    consumer = args.consumer
    expected_manifest = consumer_manifest(original)
    if consumer is None:
        require(not args.offline, 'CONSUMER_MISSING')
        consumer = root / 'consumer'
        consumer.mkdir()
        target = root / 'dsh-a2ui-0.1.0-alpha.13.tgz'
        if artifact.resolve() != target.resolve():
            shutil.copyfile(artifact, target)
        (consumer / 'package.json').write_text(json.dumps(expected_manifest, indent=2))
        shutil.copyfile(bundle / 'pnpm-lock.yaml', consumer / 'pnpm-lock.yaml')
        run(consumer, 'rc3-install', ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts', '--store-dir', str(root / 'store')])
    require(json.loads((consumer / 'package.json').read_text()) == expected_manifest, 'CONSUMER_MANIFEST')
    require(digest(consumer / 'pnpm-lock.yaml') == LOCK_SHA, 'CONSUMER_LOCK')
    run(consumer, 'resolved-versions', ['node', str(bundle / 'runtime-versions.mjs'), str(consumer), str(source)])
    versions = json.loads((root / 'resolved-versions.log').read_text())
    installed = Path(versions.pop('pluginDirectory'))
    verify_artifact(artifact, original, installed)
    print('GUARDS PASSED: source, 22 archives, frozen lock, installed bytes, fixture and plugin peers', flush=True)
    print('Evidence directory:', root, flush=True)
    if args.check_only:
        return
    require(not (args.offline and args.npm_counterexample), 'OFFLINE_COUNTEREXAMPLE: installation disabled')
    if args.npm_counterexample:
        proof = root / 'npm-counterexample'
        proof.mkdir()
        manifest = {key: value for key, value in expected_manifest.items() if key != 'devDependencies'}
        (proof / 'package.json').write_text(json.dumps(manifest))
        shutil.copyfile(artifact, root / 'dsh-a2ui-0.1.0-alpha.13.tgz') if artifact.resolve() != (root / 'dsh-a2ui-0.1.0-alpha.13.tgz').resolve() else None
        run(proof, 'npm-counterexample', ['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--fetch-retries=0'], expected=1)
        require('ERESOLVE' in (root / 'npm-counterexample.log').read_text(), 'EXPECTED_ERESOLVE')
    candidate = root / 'candidate'
    shutil.copytree(source, candidate)
    (candidate / 'node_modules').symlink_to(consumer / 'node_modules', target_is_directory=True)
    spec = importlib.util.spec_from_file_location('rc3_adapt', bundle / 'adapt-fixtures.py')
    adapter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(adapter)
    patch = adapter.emit(source, candidate, (bundle / 'two-session-body.mjs').read_text())
    require(patch == (bundle / 'fixture-adaptations.patch').read_text(), 'FIXTURE_DELTA: changed adaptation')
    extra = {'DSH_A2UI_PACKED_PATH': str(installed)}
    fixtures = [('host', ['compat-fixtures/host.mjs', str(installed)]),
                ('profile-client', ['scripts/verify-profile-client.mjs', str(installed)]),
                ('lifecycle', ['compat-fixtures/lifecycle.mjs', str(installed)]),
                ('persistence', ['compat-fixtures/persistence.mjs', str(installed)]),
                ('loop', ['compat-examples/loop.mjs']), ('two-session', ['compat-examples/two-session.mjs']),
                ('stream-success', ['compat-fixtures/stream.mjs', str(installed), 'success']),
                ('stream-cancel', ['compat-fixtures/stream.mjs', str(installed), 'cancel']),
                ('ui', ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.compat.config.ts'])]
    print('BEHAVIOR START: 9 synthetic fixture commands', flush=True)
    for label, command in fixtures:
        run(candidate, label, ['node', *command], extra=extra)
    print('PASS: 9 SDK/jsdom fixture commands; no native full-host or adoption claim', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error))
