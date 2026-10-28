#!/usr/bin/env python3
"""Bounded preflight tests; requires the prepared inputs named on the command line."""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('rc3_driver', HERE / 'validate-rc3.py')
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
parser = argparse.ArgumentParser(description=__doc__)
for name in ('source', 'source-archive', 'artifact', 'consumer', 'package-cache'):
    parser.add_argument('--' + name, type=Path, required=True)
ARGS = parser.parse_args()


class Guards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='dsh-rc3-guard-', dir='/tmp')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def command(self, bundle=HERE, consumer=None):
        return [sys.executable, str(HERE / 'validate-rc3.py'), '--bundle', str(bundle),
                '--offline', '--check-only', '--source', str(ARGS.source),
                '--source-archive', str(ARGS.source_archive), '--artifact', str(ARGS.artifact),
                '--consumer', str(consumer or ARGS.consumer), '--package-cache', str(ARGS.package_cache)]

    def run_driver(self, expected, token, bundle=HERE, consumer=None):
        result = subprocess.run(self.command(bundle, consumer), capture_output=True, text=True, timeout=45)
        output = result.stdout + result.stderr
        self.assertEqual(result.returncode, expected, output)
        self.assertIn(token, output)
        self.assertNotIn('BEHAVIOR START', output)
        return output

    def copy_bundle(self):
        bundle = self.root / 'bundle'
        bundle.mkdir()
        for name in (*driver.INPUTS, 'SHA256SUMS'):
            shutil.copyfile(HERE / name, bundle / name)
        return bundle

    def rewrite_sums(self, bundle):
        (bundle / 'SHA256SUMS').write_text(''.join(driver.digest(bundle / name) + '  ' + name + '\n' for name in driver.INPUTS))

    def test_positive_all_guards(self):
        rows = driver.verify_inputs(HERE)
        self.assertEqual(len(rows), 22)
        driver.verify_packages(rows, ARGS.package_cache, True)
        self.run_driver(0, 'GUARDS PASSED')

    def test_input_checksum_stops_before_behavior(self):
        bundle = self.copy_bundle()
        with (bundle / 'two-session-body.mjs').open('a') as output:
            output.write('// bounded checksum tamper\n')
        self.run_driver(1, 'INPUT_CHECKSUM', bundle)

    def test_checksum_inventory_stops_before_behavior(self):
        bundle = self.copy_bundle()
        lines = (bundle / 'SHA256SUMS').read_text().splitlines(True)
        (bundle / 'SHA256SUMS').write_text(''.join(lines[:-1]))
        self.run_driver(1, 'INPUT_INVENTORY', bundle)

    def test_package_inventory_even_with_matching_sums(self):
        bundle = self.copy_bundle()
        inventory = json.loads((bundle / 'official-packages.json').read_text())
        inventory[-1]['name'] = '@deepseek-ai/unexpected-synthetic-package'
        (bundle / 'official-packages.json').write_text(json.dumps(inventory))
        self.rewrite_sums(bundle)
        self.run_driver(1, 'PACKAGE_INVENTORY', bundle)

    def test_package_archive_checksum(self):
        bundle = self.copy_bundle()
        rows = driver.verify_inputs(bundle)
        cache = self.root / 'cache'
        cache.mkdir()
        first = rows[0]
        name = first['name'].split('/')[1] + '-0.2.1-rc.3.tgz'
        data = bytearray((ARGS.package_cache / name).read_bytes())
        data[-1] ^= 1
        (cache / name).write_bytes(data)
        with self.assertRaisesRegex(ValueError, 'PACKAGE_CHECKSUM'):
            driver.verify_packages(rows, cache, True)

    def test_plugin_peer_wrong_while_fixture_peer_correct(self):
        # Synthetic metadata graph; never edit a reviewed installed package.
        consumer = self.root / 'consumer'
        consumer.mkdir()
        for name in ('package.json', 'pnpm-lock.yaml'):
            shutil.copyfile(ARGS.consumer / name, consumer / name)
        modules = consumer / 'node_modules'
        modules.mkdir()
        for entry in (ARGS.consumer / 'node_modules').iterdir():
            if entry.name.startswith('.') or entry.name == 'dsh-a2ui':
                continue
            if entry.name.startswith('@'):
                scope = modules / entry.name
                scope.mkdir()
                for package in entry.iterdir():
                    (scope / package.name).symlink_to(package.resolve(), target_is_directory=True)
            else:
                (modules / entry.name).symlink_to(entry.resolve(), target_is_directory=entry.is_dir())
        with tarfile.open(ARGS.artifact) as archive:
            archive.extractall(self.root / 'unpack', filter='data')
        shutil.move(self.root / 'unpack/package', modules / 'dsh-a2ui')
        wrong = modules / 'dsh-a2ui/node_modules/@deepseek-ai/dsh-tools'
        wrong.mkdir(parents=True)
        (wrong / 'package.json').write_text(json.dumps({'name':'@deepseek-ai/dsh-tools', 'version':'0.2.0-rc.2'}))
        output = self.run_driver(1, 'PLUGIN_PEER_VERSION: @deepseek-ai/dsh-tools', consumer=consumer)
        self.assertNotIn('FIXTURE_VERSION:', output)
        self.assertNotIn('GUARDS PASSED', output)


if __name__ == '__main__':
    unittest.main(argv=[sys.argv[0]], verbosity=2)
