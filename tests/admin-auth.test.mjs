import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readAuthLink, consumeAuthLink, recoveryRedirect, validatePassword, verifyEmailLink, setAccountPassword, requestRecovery } from '../assets/js/admin/auth-flow.js';
import { authConfig } from '../admin/config.js';
const token = 'a'.repeat(64);
const url = fragment => `https://example.test/NEXO-INMOBILIARIA/admin/activar.html${fragment}`;
test('invitation and recovery hashes parse without accepting ambiguous credentials', () => {
  assert.deepEqual(readAuthLink(url(`#token_hash=${token}&type=invite`)),{kind:'invite',tokenHash:token});
  assert.equal(readAuthLink(url(`?token_hash=${token}&type=recovery`)).kind,'recovery');
  for(const suffix of [`#access_token=sensitive&refresh_token=sensitive`,`?code=unsupported`,`#token_hash=${token}&type=signup`,`?token_hash=${token}#token_hash=${token}&type=invite`,`#token_hash=short&type=invite`,`#error=expired`]) assert.equal(readAuthLink(url(suffix)).kind,'invalid');
  assert.equal(readAuthLink(url('')).kind,'none');
});
test('URL is cleaned even when the token is invalid', () => {
  for(const hash of [`#token_hash=${token}&type=invite`,'#access_token=sensitive','?code=unsupported']){
    let replacement;const location={href:url(hash),pathname:'/NEXO-INMOBILIARIA/admin/activar.html'};
    consumeAuthLink(location,{replaceState:(_a,_b,path)=>replacement=path});
    assert.equal(replacement,location.pathname);
  }
});
test('recovery redirect is fixed to configured GitHub Pages path', () => {
  assert.equal(recoveryRedirect('https://example.test/NEXO-INMOBILIARIA'),'https://example.test/NEXO-INMOBILIARIA/admin/recuperar.html');
  for(const bad of ['http://example.test','https://user:secret@example.test','https://example.test/?next=evil','javascript:alert(1)'])assert.throws(()=>recoveryRedirect(bad));
});
test('password validation checks length and confirmation', () => {
  assert(validatePassword('short','short'));assert(validatePassword('a'.repeat(12),'b'.repeat(12)));assert(validatePassword('a'.repeat(129),'a'.repeat(129)));
  assert.equal(validatePassword('unique-test-password','unique-test-password'),'');
});
function mockAuth(overrides={}) {
  const calls=[];
  const defaults={
    signOut:async options=>{calls.push(['signOut',options]);return {error:null};},
    verifyOtp:async options=>{calls.push(['verifyOtp',options]);return {data:{session:{},user:{id:'test-user'}}};},
    getUser:async()=>({data:{user:{id:'test-user'}}}),
    updateUser:async options=>{calls.push(['updateUser',options]);return {error:null};},
    resetPasswordForEmail:async(email,options)=>{calls.push(['reset',email,options]);return {error:null};},
  };
  return {client:{auth:{...defaults,...overrides}},calls};
}
test('verifyOtp uses the expected type and server-verified identity', async () => {
  const {client,calls}=mockAuth();
  assert.equal((await verifyEmailLink(client,{kind:'invite',tokenHash:token},'invite')).id,'test-user');
  assert.deepEqual(calls[1],['verifyOtp',{token_hash:token,type:'invite'}]);
  await assert.rejects(()=>verifyEmailLink(client,{kind:'recovery',tokenHash:token},'invite'));
  const mismatched=mockAuth({getUser:async()=>({data:{user:{id:'wrong-user'}}})});
  await assert.rejects(()=>verifyEmailLink(mismatched.client,{kind:'invite',tokenHash:token},'invite'));
  assert.equal(mismatched.calls.filter(c=>c[0]==='signOut').length,2);
});
test('expired or reused links are rejected', async () => {
  const {client}=mockAuth({verifyOtp:async()=>({error:{message:'expired'}})});
  await assert.rejects(()=>verifyEmailLink(client,{kind:'recovery',tokenHash:token},'recovery'));
});
test('password update requires a verified session, then logs out without assigning roles', async () => {
  const {client,calls}=mockAuth();
  assert.deepEqual(await setAccountPassword(client,'unique-test-password','unique-test-password'),{signedOut:true});
  assert.deepEqual(calls.map(c=>c[0]),['updateUser','signOut']);
  const anonymous=mockAuth({getUser:async()=>({data:{user:null}})});
  await assert.rejects(()=>setAccountPassword(anonymous.client,'unique-test-password','unique-test-password'));
  assert.equal(anonymous.calls.length,0);
});
test('recovery only sends to the fixed callback and returns no account enumeration data', async () => {
  const {client,calls}=mockAuth();
  assert.equal(await requestRecovery(client,'fixture@example.test','https://example.test/NEXO-INMOBILIARIA'),undefined);
  assert.deepEqual(calls[0],['reset','fixture@example.test',{redirectTo:'https://example.test/NEXO-INMOBILIARIA/admin/recuperar.html'}]);
});
test('configuration is empty and auth pages have no third-party scripts or public signup', async () => {
  assert.deepEqual(authConfig,{supabaseUrl:'',publishableKey:'',siteUrl:''});
  for(const file of ['activar','login','recuperar']){
    const html=await readFile(new URL(`../admin/${file}.html`,import.meta.url),'utf8');
    assert(html.includes('no-referrer'));assert(html.includes('noindex'));assert(!/<script[^>]+src=["']https?:/.test(html));
  }
});
