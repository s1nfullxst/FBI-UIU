import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from urllib.parse import urlsplit,parse_qs
from aiohttp import web
from aiohttp.test_utils import TestClient,TestServer
from tod_portal import TODPortal,TOD_ROLE_ID,SESSION_COOKIE,STATE_COOKIE

class PortalTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        (self.root/'uniform.png').write_bytes(b'private image bytes')
        (self.root/'manifest.json').write_text('[{"title":"TOD reference","file":"uniform.png","caption":"Approved outfit"}]')
        self.member=SimpleNamespace(bot=False,roles=[SimpleNamespace(id=TOD_ROLE_ID)])
        self.guild=SimpleNamespace(fetch_member=AsyncMock(side_effect=lambda uid:self.member))
        self.bot=SimpleNamespace(application_id=12345,guild_id=789,records=SimpleNamespace(),get_guild=lambda gid:self.guild)
        self.portal=TODPortal(self.bot,client_secret='test-only-secret',origin='https://portal.test',directory=self.root)
        self.portal.exchange=AsyncMock(return_value=123)
        app=web.Application(client_max_size=1024);self.portal.install(app)
        self.client=TestClient(TestServer(app));await self.client.start_server()
    async def asyncTearDown(self):
        await self.client.close();self.temp.cleanup()
    def signed(self):
        self.portal.sessions['test-session']={'user_id':123,'expires':time.monotonic()+3600,'csrf':'test-csrf'}
        return {'Cookie':SESSION_COOKIE+'=test-session'}
    async def begin(self):
        r=await self.client.get('/tod/login',allow_redirects=False)
        self.assertEqual(r.status,302)
        return parse_qs(urlsplit(r.headers['Location']).query)['state'][0],r
    async def test_anonymous_cannot_fetch_image_or_catalog(self):
        r=await self.client.get('/tod/files/uniform.png');self.assertEqual(r.status,401);self.assertNotIn(b'private image',await r.read())
        r=await self.client.get('/tod');self.assertNotIn('uniform.png',await r.text());self.assertIn('Sign in with Discord',await r.text())
    async def test_wrong_role_denied_even_with_valid_session(self):
        self.member.roles=[SimpleNamespace(id=1)]
        r=await self.client.get('/tod/files/uniform.png',headers=self.signed());self.assertEqual(r.status,403);self.assertNotIn('test-session',self.portal.sessions)
    async def test_role_removal_blocks_next_image(self):
        headers=self.signed();r=await self.client.get('/tod/files/uniform.png',headers=headers);self.assertEqual(r.status,200);self.assertEqual(await r.read(),b'private image bytes');self.assertIn('no-store',r.headers['Cache-Control'])
        self.member.roles=[];r=await self.client.get('/tod/files/uniform.png',headers=headers);self.assertEqual(r.status,403);self.assertEqual(self.guild.fetch_member.await_count,2)
    async def test_oauth_state_replay_and_secure_session(self):
        state,start=await self.begin();self.assertEqual(parse_qs(urlsplit(start.headers['Location']).query)['scope'],['identify'])
        self.assertTrue(start.cookies[STATE_COOKIE]['secure']);self.assertTrue(start.cookies[STATE_COOKIE]['httponly'])
        path='/tod/callback?code=test-code&state='+state
        r=await self.client.get(path,headers={'Cookie':STATE_COOKIE+'='+state},allow_redirects=False);self.assertEqual(r.status,302)
        self.assertTrue(r.cookies[SESSION_COOKIE]['secure']);self.assertTrue(r.cookies[SESSION_COOKIE]['httponly']);self.assertEqual(r.cookies[SESSION_COOKIE]['samesite'],'Lax')
        r=await self.client.get(path,headers={'Cookie':STATE_COOKIE+'='+state},allow_redirects=False);self.assertEqual(r.status,400);self.assertEqual(self.portal.exchange.await_count,1)
    async def test_state_wrong_cookie_or_missing_denied(self):
        state,_=await self.begin()
        for cookie in ['',STATE_COOKIE+'=different']:
            r=await self.client.get('/tod/callback?code=test&state='+state,headers={'Cookie':cookie});self.assertEqual(r.status,400)
        self.portal.exchange.assert_not_awaited()
    async def test_expired_login_state_denied(self):
        state,_=await self.begin();self.portal.states[state]['expires']=0
        r=await self.client.get('/tod/callback?code=test&state='+state,headers={'Cookie':STATE_COOKIE+'='+state});self.assertEqual(r.status,400);self.portal.exchange.assert_not_awaited()
    async def test_non_tod_oauth_does_not_issue_session(self):
        self.member.roles=[];state,_=await self.begin();r=await self.client.get('/tod/callback?code=test&state='+state,headers={'Cookie':STATE_COOKIE+'='+state});self.assertEqual(r.status,403);self.assertNotIn(SESSION_COOKIE,r.cookies);self.assertEqual(self.portal.sessions,{})
    async def test_expired_session_denied(self):
        headers=self.signed();self.portal.sessions['test-session']['expires']=0
        r=await self.client.get('/tod/files/uniform.png',headers=headers);self.assertEqual(r.status,401)
    async def test_guild_unavailable_fails_closed(self):
        self.bot.get_guild=lambda gid:None;r=await self.client.get('/tod/files/uniform.png',headers=self.signed());self.assertEqual(r.status,503)
    async def test_manifest_escape_and_unlisted_asset(self):
        (self.root/'manifest.json').write_text('[{"title":"<script>alert(1)</script>","file":"uniform.png"}]')
        r=await self.client.get('/tod',headers=self.signed());body=await r.text();self.assertNotIn('<script>',body);self.assertIn('&lt;script&gt;',body)
        (self.root/'other.png').write_bytes(b'not listed');r=await self.client.get('/tod/files/other.png',headers=self.signed());self.assertEqual(r.status,404)
        (self.root/'manifest.json').write_text('[{"title":"Bad","file":"../secret.png"}]');r=await self.client.get('/tod/files/uniform.png',headers=self.signed());self.assertEqual(r.status,503)
    async def test_logout_requires_origin_and_csrf(self):
        headers=self.signed();r=await self.client.post('/tod/logout',headers=headers,data={'csrf':'test-csrf'});self.assertEqual(r.status,403);self.assertIn('test-session',self.portal.sessions)
        r=await self.client.post('/tod/logout',headers={**headers,'Origin':'https://portal.test'},data={'csrf':'test-csrf'},allow_redirects=False);self.assertEqual(r.status,302);self.assertNotIn('test-session',self.portal.sessions)
    async def test_unconfigured_does_not_offer_fake_login(self):
        self.portal.secret='';r=await self.client.get('/tod/login');self.assertEqual(r.status,503);self.assertNotIn('Location',r.headers)
        r=await self.client.get('/tod/status');self.assertEqual(await r.json(),{'configured':False})

if __name__=='__main__':unittest.main()
