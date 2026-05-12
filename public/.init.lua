-- Redbean request handler for the Solid Router SPA.
--
-- Three responsibilities:
--   1. SPA fallback: requests for paths that don't match a file get
--      index.html with HTTP 200 (not 404) so Solid can handle them
--      client-side. Crawlers / shared links see 200 instead of 404.
--   2. Cache headers: fingerprinted assets in /assets/* get an immutable
--      one-year cache (their content never changes per filename). Other
--      files get a short revalidate window.
--   3. __SITE_ORIGIN__ substitution: HTML / XML emitted at build time uses
--      the placeholder `__SITE_ORIGIN__` everywhere we'd normally hardcode
--      `https://ibp.network`. At response time we replace it with the
--      requesting host so the same image works under ibp.rotko.net,
--      dotters.network, ibp.network — no rebuild needed per deployment.

-- Security headers applied to every response. Referrer-Policy is set globally
-- by HAProxy on the web.rotko.net frontend, so we don't duplicate it here.
ProgramHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
ProgramHeader('X-Content-Type-Options', 'nosniff')
ProgramHeader('X-Frame-Options', 'DENY')

-- Default cache lifetime for assets served by `ServeAsset`. Redbean's
-- own auto-Cache-Control overrides any `SetHeader('Cache-Control', ...)`
-- set in OnHttpRequest before ServeAsset, so we use ProgramCache for the
-- non-fingerprinted-static default (favicons, og-card, brand SVGs,
-- world-dots, hero bg). Fingerprinted `/assets/*` goes through an explicit
-- Write path below to claim the 1-year immutable lifetime.
ProgramCache(604800)  -- 7 days

-- Minimal content-type table for the explicit Write path. Redbean's own
-- detection is only used when we hand off to ServeAsset.
local MIME = {
   js    = 'text/javascript; charset=utf-8',
   mjs   = 'text/javascript; charset=utf-8',
   css   = 'text/css; charset=utf-8',
   svg   = 'image/svg+xml',
   woff2 = 'font/woff2',
   woff  = 'font/woff',
   map   = 'application/json',
   json  = 'application/json',
}
local function mimeOf(p)
   local ext = p:match('%.([%w]+)$') or ''
   return MIME[ext:lower()] or 'application/octet-stream'
end

-- In-process cache for upstream ibdash API responses. Globals persist
-- across requests inside one redbean worker. Key is the query string
-- (`?start=…&end=…&member=…`), value is `{ body, contentType, expires }`.
-- TTL is 1 hour: ibdash aggregates daily, so re-fetching more often than
-- that just burns upstream bandwidth without changing the answer.
local apiCache = {}
local API_TTL = 3600
local API_UPSTREAM = 'https://ibdash.dotters.network:9000/api'

local function nowSeconds()
   return unix.clock_gettime() or os.time()
end

-- Compute `https://<requesting-host>` from the request's Host header.
local function siteOrigin()
   local host = GetHeader('Host') or 'ibp.rotko.net'
   -- Strip any port suffix; HAProxy already terminates TLS in front of us.
   host = host:gsub(':%d+$', '')
   return 'https://' .. host
end

local function writeWithOriginRewrite(body)
   if not body then return end
   local origin = siteOrigin()
   -- Plain string substitution (no Lua-pattern magic) so dots in the
   -- placeholder don't bite.
   Write((body:gsub('__SITE_ORIGIN__', origin)))
end

-- Rebuild the request's query string from GetParams (which returns an
-- array of {name, value} pairs). Returns empty string if no params.
local function currentQuery()
   local params = GetParams()
   if not params or #params == 0 then return '' end
   local parts = {}
   for _, p in ipairs(params) do
      table.insert(parts, EscapeParam(p[1]) .. '=' .. EscapeParam(p[2] or ''))
   end
   return '?' .. table.concat(parts, '&')
end

-- Proxy + cache the upstream ibdash API. We expose it at `/api/ibdash/...`
-- so the browser sees a same-origin request (no extra TLS handshake), and
-- the first visitor in a TTL window pays the upstream fetch; everyone else
-- within the hour gets the cached body instantly. Falls through to stale on
-- upstream failure so the site degrades gracefully rather than 500-ing.
local function serveIbdashApi(rest, query)
   local key = rest .. query
   local now = nowSeconds()
   local cached = apiCache[key]
   if cached and cached.expires > now then
      SetStatus(200)
      SetHeader('Content-Type', cached.contentType)
      SetHeader('Cache-Control', 'public, max-age=' .. API_TTL)
      SetHeader('X-Cache', 'HIT')
      Write(cached.body)
      return
   end
   local upstream = API_UPSTREAM .. rest .. query
   local ok, status, headers, body = pcall(Fetch, upstream)
   if ok and status == 200 and body then
      local ct = 'application/json; charset=utf-8'
      if headers and headers['Content-Type'] then ct = headers['Content-Type'] end
      apiCache[key] = { body = body, contentType = ct, expires = now + API_TTL }
      SetStatus(200)
      SetHeader('Content-Type', ct)
      SetHeader('Cache-Control', 'public, max-age=' .. API_TTL)
      SetHeader('X-Cache', 'MISS')
      Write(body)
      return
   end
   -- Fall back to stale on upstream failure.
   if cached then
      SetStatus(200)
      SetHeader('Content-Type', cached.contentType)
      SetHeader('Cache-Control', 'public, max-age=60')
      SetHeader('X-Cache', 'STALE')
      Write(cached.body)
      return
   end
   SetStatus(502)
   SetHeader('Content-Type', 'application/json; charset=utf-8')
   Write('{"error":"upstream unavailable"}')
end

function OnHttpRequest()
   local path = GetPath()
   local isFile = path == '/' or path:match('%.[%w]+$') ~= nil

   -- `/api/ibdash/*` proxy through to the dashboard API with a 1 h cache.
   -- The site's `dashboard.ts` points its API_BASE here so cross-origin TLS
   -- handshakes (and ibdash request volume) drop to once-per-hour worst case.
   local apiRest = path:match('^/api/ibdash(/.+)$')
   if apiRest then
      serveIbdashApi(apiRest, currentQuery())
      return
   end

   -- SPA route: serve a per-route prerendered index.html if it exists, else
   -- the global /index.html. Both get the origin-rewrite applied.
   if not isFile then
      SetStatus(200)
      SetHeader('Content-Type', 'text/html; charset=utf-8')
      SetHeader('Cache-Control', 'public, max-age=0, must-revalidate')
      local body = LoadAsset(path .. '/index.html') or LoadAsset('/index.html')
      writeWithOriginRewrite(body)
      return
   end

   -- HTML and XML files: serve via Write + rewrite so __SITE_ORIGIN__ resolves.
   if path == '/' or path == '/index.html' then
      SetStatus(200)
      SetHeader('Content-Type', 'text/html; charset=utf-8')
      SetHeader('Cache-Control', 'public, max-age=0, must-revalidate')
      writeWithOriginRewrite(LoadAsset('/index.html'))
      return
   end
   if path == '/sitemap.xml' then
      SetStatus(200)
      SetHeader('Content-Type', 'application/xml; charset=utf-8')
      SetHeader('Cache-Control', 'public, max-age=3600')
      writeWithOriginRewrite(LoadAsset('/sitemap.xml'))
      return
   end

   -- /assets/* — fingerprinted, never change. We serve them via Write() so
   -- our Cache-Control: immutable header sticks (redbean's ServeAsset
   -- always overrides SetHeader with its ProgramCache default). For
   -- compression, the build pre-gzips every asset to a .gz sibling; we
   -- send that when the client accepts gzip, raw bytes otherwise.
   if path:match('^/assets/') then
      local accept = GetHeader('Accept-Encoding') or ''
      local body
      local encoding
      if accept:find('gzip') then
         body = LoadAsset(path .. '.gz')
         if body then encoding = 'gzip' end
      end
      if not body then
         body = LoadAsset(path)
      end
      if body then
         SetStatus(200)
         SetHeader('Content-Type', mimeOf(path))
         SetHeader('Cache-Control', 'public, max-age=31536000, immutable')
         SetHeader('Vary', 'Accept-Encoding')
         if encoding then SetHeader('Content-Encoding', encoding) end
         Write(body)
         return
      end
   end

   -- /data/* — mirrored canonical config (members, services, bootnodes).
   -- Short cache; we want config changes visible within an hour.
   if path:match('^/data/') then
      SetHeader('Cache-Control', 'public, max-age=3600')
   elseif path == '/robots.txt' or path == '/llms.txt' then
      SetHeader('Cache-Control', 'public, max-age=3600')
   end
   -- All other static assets fall through with the ProgramCache 7-day default.
   if not ServeAsset(path) then
      Route()
   end
end
