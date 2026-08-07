# nginx/

TLS termination and reverse proxy. The only container reachable from outside.

```
nginx/
├── Dockerfile
├── nginx.conf
└── tools/
    └── gen-cert.sh
```

Related: [docker-compose](docker-compose.md) · [backend](backend.md)
· [frontend](frontend.md)

---

## What nginx is for

Four jobs:

1. **TLS termination.** The subject requires HTTPS from the browser and permits
   plain HTTP between containers. nginx is the only container holding a
   certificate; frontend and backend never deal with TLS.
2. **Single origin.** Everything is served from `https://localhost` — frontend
   at `/`, API at `/api/`. No CORS to configure, and cookies work without
   special handling.
3. **WebSocket proxying.** Socket.IO needs an explicit upgrade path.
4. **Security headers**, set once at the edge for every response from both
   services.

---

## Dockerfile

```dockerfile
FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY nginx.conf /etc/nginx/nginx.conf
COPY tools/gen-cert.sh /usr/local/bin/gen-cert.sh
RUN chmod +x /usr/local/bin/gen-cert.sh && /usr/local/bin/gen-cert.sh

EXPOSE 2222
CMD ["nginx", "-g", "daemon off;"]
```

**Single stage** — nothing is compiled, so there is nothing to discard.

**`--no-cache`** on `apk add` skips writing the package index, keeping the
layer small.

**Copying to `/etc/nginx/nginx.conf`** replaces the main config, which is why
`nginx.conf` must include the full `events {}` / `http {}` structure. Copying
into `/etc/nginx/conf.d/default.conf` instead would mean writing only a
`server {}` block.

**`daemon off;`** keeps nginx in the foreground. A backgrounded process would
make PID 1 exit and the container stop immediately.

**Certificate generated at build time**, so it is baked into an image layer.
Acceptable here; in production certs are mounted at runtime from a secret
store, since anyone with the image otherwise has the private key.

---

## tools/gen-cert.sh

```sh
openssl req -x509 -nodes \
	-newkey rsa:2048 \
	-days 365 \
	-keyout "$CERT_DIR/key.pem" \
	-out "$CERT_DIR/cert.pem" \
	-subj "/C=PT/ST=Lisboa/L=Lisboa/O=42Lisboa/OU=ft_transcendence/CN=localhost" \
	-addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1"
```

| Flag | Reason |
|---|---|
| `-x509` | Emit a self-signed certificate, not a signing request — there is no CA. |
| `-nodes` | Do not encrypt the private key. Otherwise nginx blocks at startup waiting for a passphrase. |
| `-newkey rsa:2048` | Generate key and cert in one step. |
| `-days 365` | Expiry. Regenerate with `make re` if it lapses. |
| **`-addext subjectAltName`** | **Required by Chrome.** |

**The SAN is the line that matters.** Chrome has ignored the `CN` field since
v58; a cert with only `CN=localhost` fails with
`ERR_CERT_COMMON_NAME_INVALID` and cannot be clicked through. This is the most
common reason a self-signed setup appears broken.

The browser will still warn, because the cert is self-signed and untrusted.
**Advanced → Proceed to localhost** is expected — document it in the README so
the evaluator is not surprised.

Verify:

```sh
docker run --rm transcendence-nginx \
  openssl x509 -in /etc/nginx/certs/cert.pem -noout -subject -dates -ext subjectAltName
```

---

## nginx.conf

Deliberately minimal. Every directive is either required, or a change from a
default that is worse.

### Global

```nginx
user  nginx;
worker_processes  auto;

events {
	worker_connections  1024;
}
```

**`user nginx` is required, not cosmetic.** Replacing the stock `nginx.conf`
drops its `user` directive, and the default is `nobody` — which cannot write to
`/var/cache/nginx` (owned by `nginx`), breaking proxy buffering on larger
responses.

The `events {}` block is mandatory; nginx will not start without it.

### http

```nginx
	server_tokens off;

	map $http_upgrade $connection_upgrade {
		default upgrade;
		''      close;
	}
```

`server_tokens off` removes the version from error pages and the `Server`
header. Default is *on*, so this is a real change.

The `map` is explained under [WebSockets](#websockets).

### TLS

```nginx
		listen 2222 ssl;
		http2 on;
		server_name localhost;

		ssl_certificate     /etc/nginx/certs/cert.pem;
		ssl_certificate_key /etc/nginx/certs/key.pem;
		ssl_protocols       TLSv1.2 TLSv1.3;
```

**`ssl_protocols` is the one real hardening line.** nginx's default still
permits TLS 1.0 and 1.1, both deprecated. Restricting to 1.2/1.3 is a genuine
improvement.

### Security headers

```nginx
		add_header Strict-Transport-Security "max-age=31536000" always;
		add_header X-Content-Type-Options    "nosniff"          always;
		add_header X-Frame-Options           "SAMEORIGIN"       always;
		add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
```

`always` sends them on error responses too, not only 2xx.

> **HSTS on localhost is a footgun.** The header is keyed by hostname and
> **ignores the port**, so it can force every other `http://localhost:PORT`
> project on your machine to HTTPS. `includeSubDomains` was deliberately
> dropped for this reason. To clear it: `chrome://net-internals/#hsts`.

**Content-Security-Policy is intentionally absent.** Next.js needs specific
allowances (inline styles, `unsafe-eval` in dev) and a wrong CSP produces
console errors — which the subject forbids. Add it once the frontend is stable
and verify with the console open.

### Shared proxy headers

```nginx
		proxy_http_version 1.1;
		proxy_set_header Host              $host;
		proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_set_header Upgrade           $http_upgrade;
		proxy_set_header Connection        $connection_upgrade;
```

Declared once at `server` level and inherited by all three locations.

> **nginx trap:** `proxy_set_header` is an *array* directive. A `location` that
> declares even one discards **every** inherited one. The `map` is what makes
> hoisting safe here — no location needs its own header, so inheritance holds.

**`X-Forwarded-Proto`** tells the backend the original connection was HTTPS.
Without it Nest sees a plain HTTP request and may refuse to set `Secure`
cookies. Pair it with trust-proxy enabled in Nest.

`proxy_http_version 1.1` is required for WebSocket upgrade — nginx speaks
HTTP/1.0 to upstreams by default.

---

## Routing

nginx selects the **longest matching prefix**, not the first written.

| Request | Matches | Proxied to | Rewrite |
|---|---|---|---|
| `/api/auth/login` | `/api/` | `backend:3000/auth/login` | `/api` stripped |
| `/socket.io/...` | `/socket.io/` | `backend:3000/socket.io/...` | none |
| `/gamerooms` | `/` | `frontend:3000/gamerooms` | none |

### API

```nginx
		location /api/ {
			set $backend_upstream http://backend:3000;
			rewrite ^/api/(.*)$ /$1 break;
			proxy_pass $backend_upstream;
		}
```

Nest controllers are declared `@Controller('auth')` and serve `/auth/login` —
they know nothing about `/api`. The prefix exists only so nginx can tell API
traffic from page traffic. Stripping it here keeps the backend agnostic:
identical behaviour proxied or hit directly.

The alternative is `app.setGlobalPrefix('api')` in Nest with no rewrite. Also
valid, but it couples backend routes to proxy layout.

### WebSockets

```nginx
		location /socket.io/ {
			set $ws_upstream http://backend:3000;
			proxy_pass $ws_upstream;
			proxy_read_timeout 3600s;
		}
```

**No rewrite** — the Socket.IO client and the Nest gateway both already use
`/socket.io/`.

`proxy_read_timeout 3600s` overrides the 60s default, which would otherwise
drop idle spectator connections.

> If upgrade headers are missing, Socket.IO **silently falls back to HTTP
> long-polling**. The game still works, just laggy — a very hard failure to
> diagnose. Confirm with `Upgrade: websocket` and a `101 Switching Protocols`
> in the browser Network tab.

### Frontend

```nginx
		location / {
			set $frontend_upstream http://frontend:3000;
			proxy_pass $frontend_upstream;
		}
```

Catch-all: pages, `/_next/static/*`, `/public/*`, and the dev-mode HMR socket.

---

## Upstream resolution

```nginx
		resolver 127.0.0.11 valid=10s ipv6=off;
		set $backend_upstream http://backend:3000;
		proxy_pass $backend_upstream;
```

`proxy_pass` with a **literal** hostname resolves once at config load and
caches the IP forever. A restarted container with a new IP then produces
permanent 502s until nginx is restarted — which happens constantly in dev.

Using a **variable** forces resolution per request, via Docker's embedded DNS
at `127.0.0.11`. `valid=10s` caps caching; `ipv6=off` avoids AAAA lookups that
Docker will not answer.

**Trade-off:** variable-form `proxy_pass` disables the automatic URI rewriting
a trailing slash would provide, which is why `/api/` needs an explicit
`rewrite`.

---

## Deliberately omitted

| Directive | Why not |
|---|---|
| `ssl_ciphers HIGH:!aNULL:!MD5` | Verbatim nginx's default. Restating it implies a decision that was not made. |
| `ssl_prefer_server_ciphers on` | Irrelevant under TLS 1.3; modern guidance is to leave it off. |
| `include mime.types`, `default_type` | nginx proxies 100% of traffic and never types a file. Content-Type comes from upstream. |
| `sendfile`, `tcp_nopush` | Kernel optimisations for serving files from disk. No files are served. |
| `gzip` block | Next.js compresses its own responses; double-compressing wastes CPU. |
| `listen [::]:2222` | Docker's default bridge is IPv4-only. |
| `ssl_session_cache` | Handshake-reuse tuning with no measurable effect at this scale. |
| `X-Real-IP` | Redundant with `X-Forwarded-For`, the actual standard. |
| `client_max_body_size` | Default 1M is fine until uploads exist. Add it (with a real number) when avatars land. |
| `error_log`, `pid`, `log_format` | All compile-time defaults. |

**The strongest defence:** nginx serves zero static files, so every
static-file directive is dead config.

---

## Verifying

```sh
docker compose build nginx
docker compose exec nginx nginx -t          # or: make nginx-test
docker compose logs -f nginx

curl -k -I https://localhost/               # -k skips cert verification
curl -k -I https://localhost/api/auth/me
curl -k -D - -o /dev/null https://localhost/ | grep -iE "strict-transport|x-frame|server:"
```

Reading the results:

| Result | Meaning |
|---|---|
| `502 Bad Gateway` | TLS and routing work; the upstream is down or absent. |
| `could not be resolved` in logs | Upstream container is not running. |
| `server: nginx` with no version | `server_tokens off` is working. |
| `HTTP/2` in curl output | `http2 on` negotiated. |

In dev, `nginx.conf` is live-mounted: edit it, run `make nginx-test`, then
`docker compose restart nginx` — no rebuild.
