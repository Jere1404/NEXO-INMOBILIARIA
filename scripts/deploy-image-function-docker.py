"""Pinned CLI Docker deploy through a fail-closed loopback gateway.
Default: dry run; Management API is NEVER contacted without --deploy.
The gateway blocks the source-bundling endpoint, validates actual EZBR/ESZIP
bytes before upload, and permits at most one mutation of the fixed function.
"""
import argparse
import hashlib
import hmac
import json
import os
import pathlib
import secrets
import shutil
import subprocess
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

PROJECT = 'ugrqstsuhamjjewusigh'
SLUG = 'nexo-property-image'
BASE = f'/v1/projects/{PROJECT}/functions'
MAX_BYTES = 20_000_000


def validate_target(method, target, content_type):
    url = urllib.parse.urlsplit(target)
    if url.scheme or url.netloc or url.fragment:
        raise ValueError('Only relative paths are accepted')
    if method == 'GET' and url.path == BASE and not url.query:
        return 'read'
    expected = BASE if method == 'POST' else BASE + '/' + SLUG
    if method not in ('POST', 'PATCH') or url.path != expected:
        raise ValueError('Source API fallback, other functions, SQL and unrelated endpoints are forbidden')
    query = urllib.parse.parse_qs(url.query, keep_blank_values=True, strict_parsing=True)
    allowed = {'slug', 'name', 'verify_jwt', 'entrypoint_path', 'import_map_path', 'ezbr_sha256', 'import_map'}
    if set(query) - allowed or any(len(v) != 1 for v in query.values()):
        raise ValueError('Unexpected deployment metadata')
    fields = {k: v[0] for k, v in query.items()}
    if fields.get('verify_jwt') != 'false' or fields.get('slug', SLUG) != SLUG or fields.get('name', SLUG) != SLUG:
        raise ValueError('Target or JWT configuration changed')
    if method == 'POST' and fields.get('slug') != SLUG:
        raise ValueError('Create request must identify the fixed function')
    if fields.get('import_map_path') and not (fields['import_map_path'].startswith('file:///') and fields['import_map_path'].endswith('/supabase/functions/nexo-property-image/deno.json')):
        raise ValueError('Unexpected import-map configuration')
    entry = fields.get('entrypoint_path', '')
    if not entry.startswith('file:///') or not entry.endswith('/supabase/functions/nexo-property-image/index.js'):
        raise ValueError('Unexpected entrypoint')
    if content_type.split(';', 1)[0].strip() != 'application/vnd.denoland.eszip':
        raise ValueError('Only prebuilt ESZIP uploads are allowed; multipart/source fallback is forbidden')
    return fields


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class DeploymentGateway:
    def __init__(self, root, deploy=False, token=None, validate=None, transport=None):
        self.root = root
        self.deploy = deploy
        self.token = token
        self.local_token = 'sbp_' + secrets.token_hex(20)  # Ephemeral loopback credential, not a Supabase PAT.
        self.mutations = 0
        self.success = False
        self.report = None
        self.validate = validate or self.validate_bundle
        self.transport = transport or self.forward

    def validate_bundle(self, body):
        clean_env = os.environ.copy()
        clean_env.pop('SUPABASE_ACCESS_TOKEN', None)
        result = subprocess.run(['node', 'scripts/check-image-function-bundle.mjs'], cwd=self.root, env=clean_env,
                                input=body, capture_output=True, check=False)
        if result.returncode:
            raise ValueError('Actual ESZIP/EZBR failed integrity or 20 MB size validation')
        return json.loads(result.stdout)

    def forward(self, method, target, body, content_type):
        request = urllib.request.Request('https://api.supabase.com' + target, data=body if method != 'GET' else None,
                                        headers={'Authorization': 'Bearer ' + self.token,
                                                 'Content-Type': content_type, 'Accept': 'application/json'}, method=method)
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=180) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            # No upstream headers/body are logged or relayed, to avoid credential leaks.
            return error.code, json.dumps({'message': f'Management API returned HTTP {error.code}; inspect Supabase separately'}).encode()
        except (urllib.error.URLError, TimeoutError):
            return 502, b'{"message":"Management API transport failed; outcome uncertain; no automatic retry permitted"}'

    def handle(self, method, target, body, content_type):
        fields = validate_target(method, target, content_type)
        if fields == 'read':
            return self.transport(method, target, b'', '') if self.deploy else (200, b'[]')
        if self.mutations:
            raise ValueError('A deployment was already attempted; automatic mutation retries are forbidden')
        if not body or len(body) > MAX_BYTES:
            raise ValueError('Upload artifact must be between 1 byte and 20 MB')
        report = self.validate(body)
        if fields.get('ezbr_sha256') != report['sha256'] or report['sha256'] != hashlib.sha256(body).hexdigest():
            raise ValueError('CLI bundle checksum differs from verified artifact')
        self.report = report
        print('REAL BUNDLE: ' + json.dumps(report), flush=True)
        self.mutations += 1
        if self.deploy:
            status, response = self.transport(method, target, body, content_type)
        else:
            print('DRY RUN: verified artifact retained in memory; no Supabase request sent.', flush=True)
            status = 201 if method == 'POST' else 200
            response = json.dumps({'id': '00000000-0000-4000-8000-000000000001', 'slug': SLUG, 'name': SLUG,
                                   'status': 'ACTIVE', 'version': 1, 'verify_jwt': False}).encode()
        self.success = status in (200, 201)
        return status, response


def make_handler(gateway):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Never log requests/headers/credentials.

        def process(self):
            self.connection.settimeout(180)
            try:
                if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + gateway.local_token):
                    raise ValueError('Unauthorized local request')
                # Reject fallback before consuming its multipart sources.
                validate_target(self.command, self.path, self.headers.get('Content-Type', ''))
                size = int(self.headers.get('Content-Length', '0'))
                if size < 0 or size > MAX_BYTES or self.headers.get('Transfer-Encoding'):
                    raise ValueError('Invalid or oversized request body')
                body = self.rfile.read(size)
                if len(body) != size:
                    raise ValueError('Incomplete request body')
                status, result = gateway.handle(self.command, self.path, body, self.headers.get('Content-Type', ''))
            except ValueError as error:
                if self.command != 'GET':
                    print('Bundle guard blocked request: ' + str(error), flush=True)
                status, result = 400, b'{"message":"Blocked by local bundle guard: invalid artifact/size, forbidden fallback, metadata, endpoint or retry"}'
            except Exception:
                print('Bundle guard failed closed before forwarding.', flush=True)
                status, result = 400, b'{"message":"Bundle guard failed; no fallback permitted"}'
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(result)))
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(result)
            self.close_connection = True
        do_GET = do_POST = do_PATCH = do_PUT = do_DELETE = process
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deploy', action='store_true', help='Authorize the single verified bundle upload to the fixed Supabase project')
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parent.parent
    tool_env = os.environ.copy()
    tool_env.pop('SUPABASE_ACCESS_TOKEN', None)
    if not shutil.which('docker') or subprocess.run(['docker', 'info'], env=tool_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        raise SystemExit('Docker unavailable. Stopping; no API bundling fallback is allowed.')
    if not shutil.which('supabase'):
        raise SystemExit('Supabase CLI is not installed')
    token = os.environ.get('SUPABASE_ACCESS_TOKEN') if args.deploy else None
    if args.deploy and not token:
        raise SystemExit('Missing GitHub Actions SUPABASE_ACCESS_TOKEN secret')
    gateway = DeploymentGateway(root, deploy=args.deploy, token=token)
    with tempfile.TemporaryDirectory(prefix='nexo-docker-deploy-') as temporary:
        directory = pathlib.Path(temporary)
        server = HTTPServer(('127.0.0.1', 0), make_handler(gateway))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        profile = directory / 'profile.yaml'
        profile.write_text(f'name: nexo-bundle-guard\napi_url: http://127.0.0.1:{server.server_port}\nproject_host: supabase.co\ndashboard_url: https://supabase.com/dashboard\n')
        env = os.environ.copy()
        # The real credential stays in the gateway process, never in CLI, Docker or profile files.
        env['SUPABASE_ACCESS_TOKEN'] = gateway.local_token
        env['SUPABASE_HOME'] = str(directory / 'cli-state')
        for name in ('NO_PROXY', 'no_proxy'):
            env[name] = env.get(name, '') + ',127.0.0.1,localhost'
        version = subprocess.check_output(['supabase', '--version'], env=env, text=True).strip().removeprefix('supabase ').removeprefix('v')
        if version != '2.122.0':
            server.shutdown();server.server_close();thread.join()
            raise SystemExit('Supabase CLI 2.122.0 is required for the reviewed bundle protocol')
        print('Mode: ' + ('AUTHORIZED DEPLOY' if args.deploy else 'LOCAL DRY RUN; no Management API access'), flush=True)
        try:
            result = subprocess.run(['supabase', 'functions', 'deploy', SLUG, '--project-ref', PROJECT,
                                     '--use-docker', '--profile', str(profile), '--output-format', 'text'], cwd=root, env=env,
                                    stdout=None if args.deploy else subprocess.DEVNULL)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
        if result.returncode or not gateway.success or gateway.report is None:
            raise SystemExit('Docker deployment/preflight failed or no verified bundle was received. No source API fallback was forwarded.')
        print('Completed: ' + ('one verified bundle upload' if args.deploy else 'local bundle validation ONLY; nothing deployed'), flush=True)


if __name__ == '__main__':
    main()
