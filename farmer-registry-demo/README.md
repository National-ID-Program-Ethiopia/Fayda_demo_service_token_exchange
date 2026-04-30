# Resource server demo (Django)

Django project that implements a **resource-server style API**. It **introspects** opaque access tokens at Fayda eSignet, then returns demo JSON. The same codebase still includes an **optional** sample UI and OIDC relying-party callback if you configure full OIDC client env vars.

**Repository folder:** `fayda_demo_service_token_exchange/farmer-registry-demo`  
**Django settings package:** `oidc_project` (unchanged module name)

---

## What this service does

1. **Token introspection** — `GET /api/resource` accepts `Authorization: Bearer <opaque_token>`, calls eSignet `POST .../oauth/introspect` (and `.../oauth/v2/introspect` as fallback), and returns JSON if the token is active.
2. **Demo UI (optional)** — This repo includes a simple UI for testing token-based access in a browser.
3. **Health** — `GET /health` returns `{"status":"ok","service":"farmer-registry-demo"}`.
4. **Optional UI + OIDC** — Routes such as `/`, `/callback/`, `/dashboard/` work only when you set the full relying-party variables in `.env` (see below).

If you’re integrating this as a partner (token exchange + interoperability + introspection), start here:
- `docs/token-interoperability.md`

---

## Requirements

- Python 3.11+
- `pip install -r requirements.txt`

---

## Quick start

```bash
cd /home/amani/Documents/nidp/fayda_demo_service_token_exchange/farmer-registry-demo
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
cp .env.example .env
python manage.py runserver 0.0.0.0:8000
```

Edit `.env` with your eSignet base URL and the (target audience) client id used at introspection.

---

## Configuration (`.env`)

### Introspection only (default)


| Variable | Description |
|----------|-------------|
| `ESIGNET_SERVICE_URL` | Base URL, e.g. `https://example-host/v1/esignet` (trailing slash optional). |
| `ESIGNET_TLS_INSECURE` | `true` disables TLS certificate verification for outbound eSignet HTTP calls (development only). Use `false` in production. |
| `ESIGNET_HTTP_TIMEOUT_SECS` | Optional. Default `20`. |
| `FARMER_CLIENT_ID` | `client_id` sent to the introspection endpoint (typically the **target audience** / resource client for exchanged tokens). |

**`INTROSPECT_CLIENT_ID`** is optional. Set it only if introspection must use a different `client_id` than `FARMER_CLIENT_ID`. Resolution order: `INTROSPECT_CLIENT_ID` → `FARMER_CLIENT_ID` → built-in demo default (same as the Node mock).

If `ESIGNET_SERVICE_URL` is unset, the app can derive the base from `TOKEN_ENDPOINT` **when** that variable is set (see optional OIDC block).

### Optional: full OIDC relying party (sample UI login)

If you want `/` “Sign in with Fayda” and `/callback/` code exchange to work, also set:

| Variable | Description |
|----------|-------------|
| `CLIENT_ID` | Registered OIDC client id |
| `REDIRECT_URI` | Must match the redirect URI registered for this app in eSignet |
| `AUTHORIZATION_ENDPOINT` | eSignet authorize URL |
| `TOKEN_ENDPOINT` | eSignet token URL (also used as JWT `aud` for client assertion) |
| `USERINFO_ENDPOINT` | eSignet userinfo URL |
| `PRIVATE_KEY` | RSA private key as **base64-encoded JSON JWK** (same style as Fayda mock clients) |
| `CLIENT_ASSERTION_TYPE` | Typically `urn:ietf:params:oauth:client-assertion-type:jwt-bearer` |
| `ALGORITHM` | Optional; defaults to `RS256` |

If any of these are missing, `/callback/` responds with `503` and `oidc_not_configured`.

---

## HTTP routes (summary)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Sample home / optional Fayda sign-in |
| GET/POST | `/login/` | Demo local login |
| GET | `/callback/` | OIDC redirect handler (when configured) |
| GET | `/api/resource` | JSON sample resource after introspection |
| GET | `/health` | Liveness |

Other URLs (`/dashboard/`, `/profile/`, etc.) are part of the sample UI shell.

---

## Pairing with **Fayda OIDC demo mock service**

The sibling repo **`fayda-oidc-demo-mock-service`** (React + Express) performs OIDC login, **RFC 8693 token exchange**, and **token-exchange consent** proxying. Point its `RESOURCE_SERVER_URL` (in `client/public/env-config.js`) to this app, e.g. `http://localhost:8000`, then use the demo UI to pass the exchanged opaque token in the URL fragment (`#token=...`).

---

## Security

- Do not commit `.env` or private keys.
- Use `ESIGNET_TLS_INSECURE=false` and proper trust stores in production.
- This project uses Django’s default development `SECRET_KEY` in `settings.py`; replace before any real deployment.

---

## Related repositories

- `../fayda-oidc-demo-mock-service` — React + Express relying party for PKCE, token exchange, consent.
