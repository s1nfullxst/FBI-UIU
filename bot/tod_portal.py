"""Discord sign-in and private TOD image delivery. Keep outfit files off GitHub."""
from __future__ import annotations
import asyncio
import html
import json
import os
import re
import secrets
import time
from pathlib import Path
from urllib.parse import urlencode, urlsplit
import aiohttp
import discord
from aiohttp import web

TOD_ROLE_ID = 1532377848134762536
SESSION_COOKIE = '__Host-uiu-tod'
STATE_COOKIE = '__Host-uiu-tod-state'
SITE = 'https://s1nfullxst.github.io/FBI-UIU/?page=unit#tod-outfits'
SECURITY = {
    'Cache-Control': 'no-store, private',
    'Pragma': 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'Cross-Origin-Resource-Policy': 'same-origin',
}

class TODPortal:
    def __init__(self, bot, *, client_id=None, client_secret=None, origin=None, directory=None):
        self.bot = bot
        self.client_id = str(client_id or os.getenv('DISCORD_CLIENT_ID') or bot.application_id or '')
        self.secret = client_secret if client_secret is not None else os.getenv('DISCORD_CLIENT_SECRET', '')
        self.origin = (origin or os.getenv('TOD_PUBLIC_ORIGIN') or 'https://fbi-uiu.wisp.uno').rstrip('/')
        parsed = urlsplit(self.origin)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
            raise ValueError('TOD_PUBLIC_ORIGIN must be an HTTPS origin without a path or credentials.')
        data_dir = Path(os.getenv('DATA_DIR') or Path(__file__).resolve().parent / 'data')
        self.directory = Path(directory or os.getenv('TOD_OUTFITS_DIR') or data_dir / 'tod-outfits').resolve()
        self.states = {}
        self.sessions = {}
        self.clock = time.monotonic
        self.role_slots = asyncio.Semaphore(16)

    @property
    def configured(self):
        return self.client_id.isdigit() and bool(self.secret.strip())

    def install(self, app):
        app.router.add_get('/tod/status', self.status)
        app.router.add_get('/tod', self.index)
        app.router.add_get('/tod/login', self.login)
        app.router.add_get('/tod/callback', self.callback)
        app.router.add_post('/tod/logout', self.logout)
        app.router.add_get('/tod/files/{filename}', self.asset)
        app.on_cleanup.append(self.cleanup)

    async def cleanup(self, app):
        self.sessions.clear()
        self.states.clear()

    def prune(self):
        now = self.clock()
        for store in (self.states, self.sessions):
            for key in list(store):
                if store[key]['expires'] <= now:
                    del store[key]

    def page(self, title, message='', content='', status=200):
        body = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(title)+' | UIU TOD</title><style>body{margin:0;background:#101719;color:#ecece1;font:16px Arial,sans-serif;line-height:1.7}main{max-width:1050px;margin:0 auto;padding:38px 22px}h1,h2{font-family:Georgia,serif}h1{font-size:42px}a,button{color:#e3c987}a,button{display:inline-block;padding:12px 16px;border:1px solid #53615c;background:#172124;font:inherit}header{border-bottom:1px solid #34403f;padding-bottom:20px}.tag{color:#c6ac72;font:12px monospace;letter-spacing:2px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px;margin:28px 0}article{border:1px solid #34403f;padding:20px;background:#172124}img{display:block;width:100%;height:auto}p{overflow-wrap:anywhere}button{cursor:pointer}</style></head><body><main><header><span class="tag">FBI / UIU — TOD MEMBERS</span><h1>'+html.escape(title)+'</h1><p>'+html.escape(message)+'</p><a href="'+SITE+'">Back to unit resources</a></header>'+content+'</main></body></html>'
        return web.Response(text=body, status=status, content_type='text/html', headers=SECURITY)

    def cookie(self, response, key, value, max_age):
        response.set_cookie(key, value, max_age=max_age, secure=True, httponly=True, samesite='Lax', path='/')

    async def status(self, request):
        return web.json_response({'configured': self.configured}, headers={**SECURITY, 'Access-Control-Allow-Origin':'https://s1nfullxst.github.io', 'Vary':'Origin'})

    async def has_role(self, user_id):
        guild = self.bot.get_guild(self.bot.guild_id)
        if guild is None:
            raise web.HTTPServiceUnavailable(text='Discord connection unavailable.', headers=SECURITY)
        try:
            async with self.role_slots:
                member = await asyncio.wait_for(guild.fetch_member(int(user_id)), 10)
        except discord.NotFound:
            return False
        except (discord.HTTPException, asyncio.TimeoutError):
            raise web.HTTPServiceUnavailable(text='Role verification unavailable. Try again later.', headers=SECURITY)
        return not member.bot and any(role.id == TOD_ROLE_ID for role in member.roles)

    async def authorized(self, request):
        self.prune()
        key = request.cookies.get(SESSION_COOKIE, '')
        session = self.sessions.get(key)
        if session is None:
            raise web.HTTPUnauthorized(text='Sign in with Discord at /tod.', headers=SECURITY)
        if not await self.has_role(session['user_id']):
            self.sessions.pop(key, None)
            raise web.HTTPForbidden(text='The TOD role is required.', headers=SECURITY)
        return session

    async def login(self, request):
        if not self.configured:
            return self.page('Discord sign-in is being configured', 'The outfit area is not available yet.', status=503)
        self.prune()
        if len(self.states) >= 1000 or len(self.sessions) >= 5000:
            raise web.HTTPServiceUnavailable(text='Sign-in is busy. Try again later.', headers=SECURITY)
        old = request.cookies.get(STATE_COOKIE, '')
        self.states.pop(old, None)
        state = secrets.token_urlsafe(32)
        self.states[state] = {'expires':self.clock()+600}
        query = urlencode({'client_id':self.client_id, 'redirect_uri':self.origin+'/tod/callback', 'response_type':'code', 'scope':'identify', 'state':state})
        response = web.HTTPFound('https://discord.com/oauth2/authorize?'+query, headers=SECURITY)
        self.cookie(response, STATE_COOKIE, state, 600)
        return response

    async def exchange(self, code):
        # Tokens stay in this server-side request and are never put in a page or session.
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=12)) as http:
            async with http.post('https://discord.com/api/oauth2/token', data={'client_id':self.client_id, 'client_secret':self.secret, 'grant_type':'authorization_code', 'code':code, 'redirect_uri':self.origin+'/tod/callback'}) as response:
                if response.status != 200:
                    raise ValueError('Sign-in failed')
                token = await response.json()
            access = token.get('access_token')
            if not isinstance(access,str) or not access or token.get('token_type','').lower() != 'bearer' or 'identify' not in token.get('scope','').split():
                raise ValueError('Invalid authorization response')
            try:
                async with http.get('https://discord.com/api/v10/users/@me', headers={'Authorization':'Bearer '+access}) as response:
                    if response.status != 200:
                        raise ValueError('Identity unavailable')
                    user = await response.json()
                user_id = user.get('id','')
                if not isinstance(user_id,str) or not user_id.isdigit() or len(user_id)>22:
                    raise ValueError('Invalid identity')
                return int(user_id)
            finally:
                try:
                    async with http.post('https://discord.com/api/oauth2/token/revoke', data={'client_id':self.client_id,'client_secret':self.secret,'token':access,'token_type_hint':'access_token'}, timeout=aiohttp.ClientTimeout(total=3)) as response:
                        await response.read()
                except (aiohttp.ClientError, asyncio.TimeoutError):
                    pass

    async def callback(self, request):
        self.prune()
        if not self.configured:
            return self.page('Sign-in unavailable', 'Discord login is not configured yet.', status=503)
        state = request.query.get('state','')
        cookie = request.cookies.get(STATE_COOKIE,'')
        if not state or not cookie or not secrets.compare_digest(state.encode(),cookie.encode()) or self.states.pop(state,None) is None:
            return self.page('Sign-in expired', 'Open the outfit page and sign in again.', status=400)
        response = None
        try:
            code = request.query.get('code','')
            if request.query.get('error') or not code or len(code)>2048 or request.query.get('iss','https://discord.com') != 'https://discord.com':
                return self.page('Sign-in cancelled', 'No outfit access was granted.', status=400)
            try:
                user_id = await self.exchange(code)
            except (aiohttp.ClientError, asyncio.TimeoutError, ValueError, TypeError, KeyError):
                return self.page('Sign-in could not finish', 'Try signing in again.', status=502)
            if not await self.has_role(user_id):
                return self.page('TOD access required', 'Your account must have the TOD role in the UIU Discord server.', status=403)
            if len(self.sessions)>=5000:
                return self.page('Sign-in is busy', 'Please try again later.', status=503)
            self.sessions.pop(request.cookies.get(SESSION_COOKIE,''),None)
            key = secrets.token_urlsafe(32)
            self.sessions[key] = {'user_id':user_id,'expires':self.clock()+3600,'csrf':secrets.token_urlsafe(24)}
            response = web.HTTPFound('/tod', headers=SECURITY)
            self.cookie(response, SESSION_COOKIE, key, 3600)
            return response
        finally:
            if response is not None:
                self.cookie(response, STATE_COOKIE, '', 0)

    def outfits(self):
        manifest = self.directory / 'manifest.json'
        if not manifest.is_file():
            return []
        if manifest.stat().st_size > 100000:
            raise ValueError('Manifest too large')
        rows = json.loads(manifest.read_text(encoding='utf-8'))
        if not isinstance(rows,list) or len(rows)>50:
            raise ValueError('Invalid manifest')
        valid=[]
        for row in rows:
            if not isinstance(row,dict) or not isinstance(row.get('title'),str) or not 1<=len(row['title'])<=120:
                raise ValueError('Invalid title')
            name=row.get('file','')
            if not isinstance(name,str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,119}\.(?:png|jpg|jpeg|webp)',name):
                raise ValueError('Invalid filename')
            path=(self.directory/name).resolve()
            if path.parent != self.directory or not path.is_file():
                raise ValueError('Invalid asset')
            caption=row.get('caption','')
            if not isinstance(caption,str) or len(caption)>1000:
                raise ValueError('Invalid caption')
            valid.append({'title':row['title'],'file':name,'caption':caption,'path':path})
        return valid

    async def index(self, request):
        if not self.configured:
            return self.page('Discord sign-in is being configured', 'The TOD outfit gallery will open after setup is complete.', status=503)
        if not request.cookies.get(SESSION_COOKIE):
            return self.page('TOD outfits', 'Sign in with Discord. Only members with the TOD role can open this gallery.', '<p><a href="/tod/login">Sign in with Discord</a></p>')
        try:
            session = await self.authorized(request)
        except web.HTTPUnauthorized:
            response = self.page('Session expired', 'Sign in again to check your TOD access.', '<p><a href="/tod/login">Sign in with Discord</a></p>',status=401)
            self.cookie(response,SESSION_COOKIE,'',0)
            return response
        except web.HTTPForbidden:
            response = self.page('TOD access required', 'Your account does not currently have the TOD role.',status=403)
            self.cookie(response,SESSION_COOKIE,'',0)
            return response
        try:
            rows = self.outfits()
        except (OSError, ValueError, json.JSONDecodeError):
            return self.page('Gallery unavailable', 'The outfit references need attention from staff.',status=503)
        cards=''.join('<article><h2>'+html.escape(row['title'])+'</h2><img src="/tod/files/'+row['file']+'" alt="'+html.escape(row['title'],quote=True)+'"><p>'+html.escape(row['caption'])+'</p></article>' for row in rows)
        content='<div class="grid">'+cards+'</div>' if rows else '<p>No TOD outfits have been uploaded yet.</p>'
        content+='<form method="post" action="/tod/logout"><input type="hidden" name="csrf" value="'+session['csrf']+'"><button type="submit">Sign out</button></form>'
        return self.page('TOD outfits', 'TOD membership verified. Access is checked again when an image is opened.',content)

    async def asset(self, request):
        await self.authorized(request)
        try:
            row = next((row for row in self.outfits() if row['file']==request.match_info['filename']),None)
        except (OSError,ValueError):
            raise web.HTTPServiceUnavailable(text='Gallery unavailable.',headers=SECURITY)
        if row is None:
            raise web.HTTPNotFound(text='Outfit not found.',headers=SECURITY)
        return web.FileResponse(row['path'],headers={**SECURITY,'Content-Disposition':'inline'})

    async def logout(self, request):
        self.prune()
        key=request.cookies.get(SESSION_COOKIE,'')
        session=self.sessions.get(key)
        data=await request.post()
        if request.headers.get('Origin') != self.origin or not session or not secrets.compare_digest(str(data.get('csrf','')).encode(),session['csrf'].encode()):
            raise web.HTTPForbidden(text='Invalid sign-out request.',headers=SECURITY)
        self.sessions.pop(key,None)
        response=web.HTTPFound('/tod',headers=SECURITY)
        self.cookie(response,SESSION_COOKIE,'',0)
        return response
