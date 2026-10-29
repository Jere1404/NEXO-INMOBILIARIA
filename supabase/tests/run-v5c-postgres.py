#!/usr/bin/env python3
"""Local disposable PostgreSQL test. No ports, volumes or remote database URLs.
Auth/Storage are minimal SQL fixtures, not the Supabase API/storage services.
"""
import os
from pathlib import Path
import subprocess
import time
import sys
import uuid

ROOT = Path(__file__).resolve().parents[2]
IMAGE = 'postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b'
ENV = {k: v for k, v in os.environ.items() if k not in {
    'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'}}
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
name = 'nexo-v5c-test-' + uuid.uuid4().hex[:12]

def docker(*args, **kwargs):
    return subprocess.run(DOCKER + list(args), env=ENV, check=True,
                          text=True, capture_output=True, **kwargs)

files = [ROOT / 'supabase/tests/fixtures/v5c-local-platform.sql']
files += [ROOT / 'supabase/migrations' / file for file in (
    '202610240001_v5a_schema.sql',
    '202610240002_v5b2_property_management.sql',
    '202610240003_v5b3_locations.sql')]
files += [ROOT / 'supabase/seeds/001_demo_properties.sql']
files += [ROOT / 'supabase/migrations' / file for file in (
    '202610250001_v5c1_image_contract.sql',
    '202610250002_v5c1_private_storage.sql',
    '202610250003_v5c2_image_processing.sql')]
replacement_mode = sys.argv[1:] == ['--replacement']
if sys.argv[1:] and not replacement_mode:
    raise SystemExit('Supported option: --replacement')
if replacement_mode:
    files += [ROOT / 'supabase/migrations/202610280001_legacy_image_replacement.sql',
              ROOT / 'supabase/tests/image-replacement-behavior.sql']
else:
    files += [ROOT / 'supabase/tests/v5c-recovery-behavior.sql']
try:
    # Trust is confined to this ephemeral container with networking disabled.
    docker('run', '--detach', '--rm', '--network=none', '--name', name,
           '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', IMAGE)
    for attempt in range(120):
        result = subprocess.run(DOCKER + ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'],
                                env=ENV, capture_output=True)
        if result.returncode == 0:
            break
        time.sleep(0.25)
    else:
        raise RuntimeError('Disposable PostgreSQL did not become ready')
    result = docker('exec', '-i', name, 'psql', '-X', '-U', 'postgres',
                    '-v', 'ON_ERROR_STOP=1', '-q',
                    input='\n'.join(file.read_text() for file in files), timeout=90)
    print('PASS: PostgreSQL 17: ' + ('additive replacement migration and SQL behavior assertions.' if replacement_mode else 'V5A/V5B + seed + all three V5C migrations and SQL behavior assertions.'))
    # Two real sessions contend for the same property/reservation.
    docker('exec', '-i', name, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1',
           input="update public.admin_memberships set enabled=true;")
    reservation = """select (public.nexo_service_reserve_image(
      '11111111-1111-4111-8111-111111111111',
      (select id from public.properties where public_code='nexo-001'),
      '55555555-5555-4555-8555-555555555555','jpg',100,repeat('d',64),
      'Concurrent synthetic fixture','ai',true)).id;"""
    if replacement_mode:
        reservation = """select (public.nexo_service_prepare_replacement(
          '11111111-1111-4111-8111-111111111111',
          (select id from public.properties where public_code='nexo-002'),
          (select i.id from public.property_images i join public.properties p on p.id=i.property_id where p.public_code='nexo-002' and i.storage_kind='legacy'),
          '55555555-5555-4555-8555-555555555555','jpg',100,repeat('d',64),
          'Concurrent synthetic fixture','ai',true)).id;"""
    command = DOCKER + ['exec', '-i', name, 'psql', '-X', '-U', 'postgres',
                        '-v', 'ON_ERROR_STOP=1', '-qAt']
    first = subprocess.Popen(command, env=ENV, text=True, stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    first.stdin.write("set application_name='nexo_v5c_reserve_hold'; begin; set role service_role;"
                      + reservation + "select pg_sleep(2); commit;")
    first.stdin.close()
    try:
        for attempt in range(80):
            observed = docker('exec', name, 'psql', '-X', '-U', 'postgres', '-qAt', '-c',
                "select count(*) from pg_stat_activity where application_name='nexo_v5c_reserve_hold' and wait_event='PgSleep'")
            if observed.stdout.strip() == '1':
                break
            time.sleep(0.05)
        else:
            raise RuntimeError('First reservation session never reached the lock-holding barrier')
        competitor = None
        if replacement_mode:
            competitor = subprocess.Popen(command, env=ENV, text=True, stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            competitor.stdin.write('set role service_role;' + reservation.replace('55555555-5555-4555-8555-555555555555','dddddddd-dddd-4ddd-8ddd-dddddddddddd'))
            competitor.stdin.close()
        second = subprocess.run(command, env=ENV, text=True, capture_output=True,
                                input='set role service_role;' + reservation, check=True, timeout=15)
        first.wait(timeout=15)
        first_output = first.stdout.read()
        first_errors = first.stderr.read()
        if first.returncode or '55555555-5555-4555-8555-555555555555' not in first_output:
            raise RuntimeError('First reservation failed: ' + first_errors)
        if second.stdout.strip() != '55555555-5555-4555-8555-555555555555':
            raise RuntimeError('Concurrent retry did not return the same reservation')
        count = docker('exec', name, 'psql', '-X', '-U', 'postgres', '-qAt', '-c',
            "select count(*) from public.property_images where id='55555555-5555-4555-8555-555555555555'")
        if count.stdout.strip() != '1':
            raise RuntimeError('Concurrent reservation duplicated data')
        print('PASS: two PostgreSQL sessions serialize an identical reservation and retain one row.')
        if replacement_mode:
            competitor.wait(timeout=15)
            if competitor.returncode == 0 or 'Replacement already exists' not in competitor.stderr.read():
                raise RuntimeError('Conflicting replacement was not rejected')
            print('PASS: competing operation for the same legacy image is rejected without a duplicate.')

    finally:
        if 'competitor' in locals() and competitor is not None and competitor.poll() is None:
            competitor.kill(); competitor.wait()
        if first.poll() is None:
            first.kill()
            first.wait()


    if replacement_mode:
        # Ready the hidden candidate using the existing SQL processor contract.
        setup = """set role service_role;
        do $$ declare img public.property_images; actor uuid:='11111111-1111-4111-8111-111111111111';
        prop uuid; candidate uuid:='55555555-5555-4555-8555-555555555555';
        begin
          select id into prop from public.properties where public_code='nexo-002';
          img:=public.nexo_service_claim_image(actor,prop,candidate);
          perform public.nexo_service_stage_image(actor,prop,candidate,img.processing_token,
            array[img.storage_prefix||'v-'||img.processing_token||'-480.jpg',img.storage_prefix||'v-'||img.processing_token||'-480.webp']);
          perform public.nexo_service_finalize_image(actor,prop,candidate,img.processing_token,repeat('d',64),480,360,
            '[{"format":"jpg","width":480,"height":360,"bytes":100},{"format":"webp","width":480,"height":360,"bytes":90}]'::jsonb);
        end $$;"""
        docker('exec', '-i', name, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', input=setup)
        for action in ['confirm', 'revert']:
            sql = "select (public.nexo_service_" + action + "_replacement('11111111-1111-4111-8111-111111111111',(select id from public.properties where public_code='nexo-002'),'55555555-5555-4555-8555-555555555555')).id;"
            holding = subprocess.Popen(command, env=ENV, text=True, stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            holding.stdin.write("set application_name='nexo_v5c_operation_hold'; begin; set role service_role;" + sql + 'select pg_sleep(2); commit;')
            holding.stdin.close()
            try:
                for attempt in range(80):
                    observed = docker('exec', name, 'psql', '-X', '-U', 'postgres', '-qAt', '-c',
                        "select count(*) from pg_stat_activity where application_name='nexo_v5c_operation_hold' and wait_event='PgSleep'")
                    if observed.stdout.strip() == '1':
                        break
                    time.sleep(0.05)
                else:
                    raise RuntimeError('Operation session did not reach barrier: ' + action)
                retry = subprocess.run(command, env=ENV, text=True, capture_output=True,
                    input='set role service_role;' + sql, check=True, timeout=15)
                holding.wait(timeout=15)
                if holding.returncode or retry.stdout.strip() != '55555555-5555-4555-8555-555555555555':
                    raise RuntimeError('Concurrent operation failed: ' + holding.stderr.read())
                print('PASS: concurrent ' + action + ' retries serialize and return the same operation.')
            finally:
                if holding.poll() is None:
                    holding.kill(); holding.wait()
        final = docker('exec', name, 'psql', '-X', '-U', 'postgres', '-qAt', '-c',
            "select count(*)=1 from public.property_images i join public.properties p on p.id=i.property_id where p.public_code='nexo-002' and i.image_active and i.is_primary and i.storage_kind='legacy' and i.position=0")
        if final.stdout.strip() != 't':
            raise RuntimeError('Concurrent reversal failed to restore original cover')

except subprocess.CalledProcessError as error:
    print(error.stderr)
    raise
finally:
    subprocess.run(DOCKER + ['rm', '--force', name], env=ENV,
                   capture_output=True, check=False)
