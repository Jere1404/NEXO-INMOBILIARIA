import contextlib
import io
import importlib.util
import hashlib
import json
import pathlib
import os
import subprocess
import sys
import tempfile
import unittest

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

if __name__ == '__main__':
    unittest.main()
