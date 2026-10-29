import contextlib
import io
import importlib.util
import hashlib
import http.client
import json
import pathlib
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'deploy-image-function-docker.py'
spec = importlib.util.spec_from_file_location('deploy_guard', SCRIPT)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
BODY = b'EZBRlocal-fixture'
TARGET = guard.BASE + '?slug=nexo-property-image&name=nexo-property-image&verify_jwt=false&entrypoint_path=file:///repo/supabase/functions/nexo-property-image/index.js&ezbr_sha256=' + hashlib.sha256(BODY).hexdigest()
TYPE = 'application/vnd.denoland.eszip'

class DeploymentGuardTests(unittest.TestCase):
    def setUp(self):
        stream = contextlib.redirect_stdout(io.StringIO())
        stream.__enter__()
        self.addCleanup(stream.__exit__, None, None, None)

    def gateway(self, **options):
        return guard.DeploymentGateway(pathlib.Path('.'), validate=lambda body: {'sha256': hashlib.sha256(body).hexdigest(), 'upload_bytes': len(body), 'eszip_bytes': 42}, **options)

    def test_source_fallback_is_rejected_before_transport(self):
        calls=[];g=self.gateway(deploy=True, transport=lambda *args: calls.append(args))
        with self.assertRaises(ValueError):g.handle('POST', guard.BASE + '/deploy?slug=' + guard.SLUG, b'multipart', 'multipart/form-data')
        self.assertEqual(calls, [])

    def test_other_project_function_or_operation_is_rejected(self):
        for method,target in [('POST',TARGET.replace(guard.PROJECT,'a'*20)),('PATCH',guard.BASE+'/other'),('DELETE',guard.BASE+'/'+guard.SLUG),('POST','/v1/projects/'+guard.PROJECT+'/database/query')]:
            with self.assertRaises(ValueError):guard.validate_target(method,target,TYPE)

    def test_changed_jwt_target_checksum_or_content_type_is_rejected(self):
        for target,ct in [(TARGET.replace('verify_jwt=false','verify_jwt=true'),TYPE),(TARGET.replace('name=nexo-property-image','name=other'),TYPE),(TARGET,'application/json'),(TARGET+'&slug=other',TYPE)]:
            with self.assertRaises(ValueError):guard.validate_target('POST',target,ct)
        with self.assertRaises(ValueError):self.gateway().handle('POST',TARGET.replace(hashlib.sha256(BODY).hexdigest(),'0'*64),BODY,TYPE)

    def test_dry_run_never_calls_management_api(self):
        calls=[];g=self.gateway(transport=lambda *args:calls.append(args))
        self.assertEqual(g.handle('GET',guard.BASE,b'',''),(200,b'[]'))
        self.assertEqual(g.handle('POST',TARGET,BODY,TYPE)[0],201)
        self.assertEqual(calls,[]);self.assertTrue(g.success)

    def test_only_verified_bytes_are_forwarded_once(self):
        calls=[]
        def transport(*args):calls.append(args);return 201,b'{}'
        g=self.gateway(deploy=True,transport=transport)
        self.assertEqual(g.handle('POST',TARGET,BODY,TYPE)[0],201)
        self.assertEqual(calls[0][2],BODY)
        with self.assertRaises(ValueError):g.handle('POST',TARGET,BODY,TYPE)
        self.assertEqual(len(calls),1)

    def test_failed_upload_is_not_retried(self):
        g=self.gateway(deploy=True,transport=lambda *args:(413,b'{}'))
        self.assertEqual(g.handle('POST',TARGET,BODY,TYPE)[0],413)
        with self.assertRaises(ValueError):g.handle('POST',TARGET,BODY,TYPE)
        self.assertFalse(g.success)

    def test_failed_validation_cannot_forward(self):
        calls=[];g=self.gateway(deploy=True,transport=lambda *args:calls.append(args))
        def invalid(_body):raise ValueError('Oversized or invalid bundle')
        g.validate=invalid
        with self.assertRaises(ValueError):g.handle('POST',TARGET,BODY,TYPE)
        self.assertEqual(calls,[]);self.assertEqual(g.mutations,0)

    def test_missing_docker_stops_before_starting_cli(self):
        with tempfile.TemporaryDirectory(prefix='nexo-no-docker-test-') as name:
            directory = pathlib.Path(name)
            docker = directory / 'docker'
            docker.write_text('#!/bin/sh\nexit 1\n')
            docker.chmod(0o755)
            env = os.environ.copy()
            env.pop('SUPABASE_ACCESS_TOKEN', None)
            env['PATH'] = name
            result = subprocess.run([sys.executable, '-B', str(SCRIPT)], env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Docker unavailable', result.stderr)
            self.assertNotIn('Mode:', result.stdout)

    def test_read_route_cannot_be_changed_into_a_mutation(self):
        for method in ['POST','PATCH','DELETE']:
            with self.assertRaises(ValueError):guard.validate_target(method,guard.BASE,'application/json')

class DeploymentCompletionTests(unittest.TestCase):
    def setUp(self):
        self.output = io.StringIO()
        stream = contextlib.redirect_stdout(self.output)
        stream.__enter__()
        self.addCleanup(stream.__exit__, None, None, None)
        self.report = {'sha256': hashlib.sha256(BODY).hexdigest(),
                       'upload_bytes': len(BODY), 'eszip_bytes': 42}
        self.remote = {'id': '00000000-0000-4000-8000-000000000001',
                       'slug': guard.SLUG, 'name': guard.SLUG,
                       'status': 'ACTIVE', 'verify_jwt': False,
                       'version': 4, 'ezbr_sha256': self.report['sha256'],
                       'entrypoint_path': 'file:///old-runner/supabase/functions/nexo-property-image/index.js'}
        self.calls = []

    def gateway(self, functions=None, status=200, upload_status=201, **options):
        def transport(method, target, body, content_type):
            self.calls.append((method, target, body))
            if method == 'GET':
                return status, json.dumps([self.remote] if functions is None else functions).encode()
            return upload_status, b'{}'
        return guard.DeploymentGateway(pathlib.Path('.'), deploy=True,
            expected_report=self.report, validate=lambda body: {
                **self.report, 'sha256': hashlib.sha256(body).hexdigest()},
            transport=transport, **options)

    def test_normal_upload_is_verified_against_fresh_remote_metadata(self):
        g = self.gateway()
        g.handle('POST', TARGET, BODY, TYPE)
        self.assertEqual(g.complete(0), 'uploaded-and-verified')
        self.assertEqual([call[0] for call in self.calls], ['POST', 'GET'])
        self.assertTrue(g.success)
        self.assertEqual(g.mutations, 1)

    def test_normal_patch_of_existing_function_is_also_verified(self):
        g = self.gateway()
        target = TARGET.replace(guard.BASE + '?', guard.BASE + '/' + guard.SLUG + '?')
        g.handle('PATCH', target, BODY, TYPE)
        self.assertEqual(g.complete(0), 'uploaded-and-verified')
        self.assertEqual([call[0] for call in self.calls], ['PATCH', 'GET'])

    def test_identical_remote_package_succeeds_without_any_upload(self):
        g = self.gateway()
        self.assertEqual(g.complete(0), 'unchanged-and-verified')
        self.assertEqual(self.calls, [('GET', guard.BASE, b'')])
        self.assertEqual(g.mutations, 0)
        self.assertIsNone(g.report)  # Do not invent an observed upload.
        self.assertTrue(g.success)

    def test_missing_or_invalid_remote_checksums_fail_closed(self):
        for value in [None, '', 123, True, 'bad', 'A' * 64]:
            with self.subTest(value=value):
                self.remote['ezbr_sha256'] = value
                g = self.gateway()
                with self.assertRaisesRegex(ValueError, 'missing or invalid'):
                    g.complete(0)
                self.assertFalse(g.success)
                self.assertEqual(g.mutations, 0)
        del self.remote['ezbr_sha256']
        with self.assertRaisesRegex(ValueError, 'missing or invalid'):
            self.gateway().complete(0)

    def test_different_checksum_is_not_accepted_as_no_change(self):
        self.remote['ezbr_sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'differs'):
            self.gateway().complete(0)
        self.assertEqual([call[0] for call in self.calls], ['GET'])

    def test_active_false_jwt_and_function_identity_are_all_required(self):
        for patch in [{'status': 'DEPLOYING'}, {'status': None}, {'verify_jwt': True},
                      {'verify_jwt': 'false'}, {'verify_jwt': 0}, {'verify_jwt': None},
                      {'slug': 'another-function'}, {'name': 'another-function'},
                      {'id': ''}, {'id': None}, {'entrypoint_path': None},
                      {'entrypoint_path': 'file:///other/index.js'},
                      {'import_map_path': 'file:///other/config.json'}]:
            with self.subTest(patch=patch):
                remote = {**self.remote, **patch}
                with self.assertRaises(ValueError):
                    self.gateway(functions=[remote]).complete(0)

    def test_missing_duplicate_and_malformed_function_lists_are_rejected(self):
        for functions in [[], [self.remote, self.remote], {'functions': [self.remote]}]:
            with self.subTest(functions=functions):
                g = self.gateway(functions=functions)
                with self.assertRaises(ValueError):
                    g.complete(0)
        g = self.gateway()
        for body in [b'invalid JSON', b'null']:
            g.transport = lambda *args: (200, body)
            with self.assertRaisesRegex(ValueError, 'Invalid remote'):
                g.complete(0)

    def test_no_op_requires_a_locally_verified_preflight(self):
        g = self.gateway()
        g.expected_report = None
        with self.assertRaisesRegex(ValueError, 'preflight'):
            g.complete(0)
        self.assertEqual(self.calls, [])

    def test_cli_failure_never_becomes_success_even_if_remote_matches(self):
        g = self.gateway()
        with self.assertRaisesRegex(ValueError, 'CLI failed'):
            g.complete(1)
        self.assertEqual(self.calls, [])

    def test_failed_or_uncertain_upload_cannot_fall_back_to_no_op_success(self):
        for status in [400, 413, 502]:
            with self.subTest(status=status):
                self.calls.clear()
                g = self.gateway(upload_status=status)
                g.handle('POST', TARGET, BODY, TYPE)
                with self.assertRaisesRegex(ValueError, 'uncertain'):
                    g.complete(0)
                self.assertEqual([call[0] for call in self.calls], ['POST'])

    def test_changed_local_bundle_is_blocked_before_forwarding(self):
        g = self.gateway()
        g.expected_report = {**self.report, 'sha256': '0' * 64}
        with self.assertRaisesRegex(ValueError, 'changed since preflight'):
            g.handle('POST', TARGET, BODY, TYPE)
        self.assertEqual(self.calls, [])
        self.assertEqual(g.mutations, 0)
        with self.assertRaisesRegex(ValueError, 'blocked'):
            g.complete(0)

    def test_verification_uses_fresh_metadata_not_the_cli_initial_get(self):
        g = self.gateway()
        g.handle('GET', guard.BASE, b'', '')
        self.remote['ezbr_sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'differs'):
            g.complete(0)
        self.assertEqual([call[0] for call in self.calls], ['GET', 'GET'])

    def test_metadata_read_failure_cannot_produce_success(self):
        g = self.gateway(status=503)
        with self.assertRaisesRegex(ValueError, 'Unable to read'):
            g.complete(0)
        self.assertFalse(g.success)

    def test_normal_upload_also_rejects_missing_remote_checksum(self):
        del self.remote['ezbr_sha256']
        g = self.gateway()
        g.handle('POST', TARGET, BODY, TYPE)
        with self.assertRaisesRegex(ValueError, 'missing or invalid'):
            g.complete(0)

    def test_blocked_fallback_is_not_hidden_by_matching_remote_metadata(self):
        g = self.gateway()
        with self.assertRaises(ValueError):
            g.handle('POST', guard.BASE + '/deploy?slug=' + guard.SLUG,
                     b'multipart', 'multipart/form-data')
        with self.assertRaisesRegex(ValueError, 'blocked'):
            g.complete(0)
        self.assertEqual(self.calls, [])

    def test_preflight_still_requires_real_validated_bytes_without_remote_access(self):
        g = guard.DeploymentGateway(pathlib.Path('.'),
            validate=lambda body: self.report, transport=lambda *args: self.fail('Remote call in preflight'))
        with self.assertRaisesRegex(ValueError, 'verified bundle'):
            g.complete(0)
        g.handle('GET', guard.BASE, b'', '')
        g.handle('POST', TARGET, BODY, TYPE)
        self.assertEqual(g.complete(0), 'local-only')

    def test_cli_loopback_preflight_and_no_op_use_only_synthetic_cli_credentials(self):
        preflight = guard.DeploymentGateway(pathlib.Path('.'),
            validate=lambda body: self.report,
            transport=lambda *args: self.fail('Preflight must not contact Supabase'))
        def cli_request(command, cwd, env, stdout):
            # Exercise the real loopback handler/profile without running any CLI/deploy.
            self.assertNotEqual(env['SUPABASE_ACCESS_TOKEN'], 'real-test-only')
            profile = pathlib.Path(command[command.index('--profile') + 1]).read_text()
            url = next(line.split(': ', 1)[1] for line in profile.splitlines() if line.startswith('api_url:'))
            target = guard.urllib.parse.urlsplit(url)
            connection = http.client.HTTPConnection(target.hostname, target.port, timeout=5)
            headers = {'Authorization': 'Bearer ' + env['SUPABASE_ACCESS_TOKEN']}
            try:
                connection.request('GET', guard.BASE, headers=headers)
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                functions = json.loads(response.read())
                if not functions:
                    headers['Content-Type'] = TYPE
                    connection.request('POST', TARGET, BODY, headers)
                    response = connection.getresponse()
                    self.assertEqual(response.status, 201)
                    response.read()
                return mock.Mock(returncode=0)
            finally:
                connection.close()
        with mock.patch.dict(os.environ, {'SUPABASE_ACCESS_TOKEN': 'real-test-only'}), \
             mock.patch.object(guard.subprocess, 'check_output', return_value='2.122.0'), \
             mock.patch.object(guard.subprocess, 'run', side_effect=cli_request):
            self.assertEqual(guard.run_cli(pathlib.Path('.'), preflight), 'local-only')
            remote = self.gateway()
            self.assertEqual(guard.run_cli(pathlib.Path('.'), remote), 'unchanged-and-verified')
        self.assertEqual([call[0] for call in self.calls], ['GET', 'GET'])
        self.assertEqual(remote.mutations, 0)
        self.assertEqual(preflight.mutations, 1)

    def test_main_runs_offline_preflight_before_deploy_and_copies_its_report(self):
        seen = []
        def fake_cli(root, gateway):
            seen.append(gateway)
            if not gateway.deploy:
                gateway.report = self.report
                return 'local-only'
            self.assertIs(gateway.expected_report, seen[0].report)
            return 'unchanged-and-verified'
        with mock.patch.object(sys, 'argv', [str(SCRIPT), '--deploy']), \
             mock.patch.dict(os.environ, {'SUPABASE_ACCESS_TOKEN': 'local-test-only'}), \
             mock.patch.object(guard.shutil, 'which', return_value='/local-test/tool'), \
             mock.patch.object(guard.subprocess, 'run', return_value=mock.Mock(returncode=0)), \
             mock.patch.object(guard, 'run_cli', side_effect=fake_cli):
            guard.main()
        self.assertEqual([g.deploy for g in seen], [False, True])
        self.assertIsNone(seen[0].token)
        self.assertEqual(seen[1].token, 'local-test-only')

    def test_main_does_not_start_deployment_if_local_preflight_fails(self):
        with mock.patch.object(sys, 'argv', [str(SCRIPT), '--deploy']), \
             mock.patch.dict(os.environ, {'SUPABASE_ACCESS_TOKEN': 'local-test-only'}), \
             mock.patch.object(guard.shutil, 'which', return_value='/local-test/tool'), \
             mock.patch.object(guard.subprocess, 'run', return_value=mock.Mock(returncode=0)), \
             mock.patch.object(guard, 'run_cli', side_effect=ValueError('local bundle failed')) as cli:
            with self.assertRaisesRegex(ValueError, 'local bundle failed'):
                guard.main()
        self.assertEqual(cli.call_count, 1)
        self.assertFalse(cli.call_args.args[1].deploy)


if __name__ == '__main__':
    unittest.main()
