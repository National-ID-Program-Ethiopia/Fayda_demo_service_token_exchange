# eSignet RP demo (React + Express)

End-to-end **demo relying party** for MOSIP **eSignet**: authorization code flow with **PKCE**, optional **RFC 8693 token exchange** into a cross-sector (agriculture / farmer) opaque token, and **token-exchange consent**.

**Repository folder:** `fayda_demo_service_token_exchange/fayda-oidc-demo-mock-service`

---

## Architecture

| Piece | Role |
|-------|------|
| **React app** (`client/`, port **3000**) | Builds `/authorize` URLs, stores PKCE verifier, drives sign-in, callback, dashboard, token-exchange UI. Reads `client/public/env-config.js` as `window._env_`. |
| **Express server** (`server/`, port **5000**) | Exchanges auth `code` for tokens (`POST /fetchUserInfo`), proxies **token exchange** (`POST /tokenExchange`) and **consent recording** (`POST /tokenExchangeConsent`) to eSignet. Signs **private_key_jwt** client assertions. |
| **Farmer registry demo** (`../farmer-registry-demo`, Django, port **8000**) | Resource server: introspects opaque tokens on `GET /api/resource`. Set `RESOURCE_SERVER_URL` to this base URL. |

---

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm
- Registered **OIDC client** on eSignet with `redirect_uri` matching this app (default in env: `http://localhost:3000/userprofile`)
- JWK private key for the client (same format as MOSIP examples: UTF-8 JSON JWK, then base64 for `PRIVATE_KEY_BASE64`)

---

## Install and run

```bash
cd /home/amani/Documents/nidp/fayda_demo_service_token_exchange/fayda-oidc-demo-mock-service
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Fill `server/.env` (endpoints, `CLIENT_ID`, `REDIRECT_URI`, `PRIVATE_KEY_BASE64`, `ESIGNET_SERVICE_URL`, `ESIGNET_AUD_URL`, etc.). Align `client/public/env-config.js` with the same client id and redirect URI.

```bash
npm install
npm install --prefix client
npm install --prefix server
npm run dev
```

- UI: `http://localhost:3000`
- API: `http://localhost:5000` (override with `PORT` in `server/.env`)

---

## Configuration files

### 1. `server/.env` (secrets — gitignored)

Required keys are validated at startup (see `server/server.js`). Typical entries:

- `CLIENT_ID`, `REDIRECT_URI`, `TOKEN_ENDPOINT`, `USERINFO_ENDPOINT`
- `ESIGNET_SERVICE_URL`, `ESIGNET_AUD_URL` (JWT `aud` for client assertion; usually the token endpoint issuer path)
- `PRIVATE_KEY_BASE64` — base64 of the JWK JSON
- `CLIENT_ASSERTION_TYPE`
- `CORS_ORIGIN` — e.g. `http://localhost:3000`
- Token exchange defaults: `TOKEN_EXCHANGE_TARGET_AUDIENCE`, `TOKEN_EXCHANGE_SCOPE`
- Optional: `TOKEN_EXCHANGE_ENDPOINT`, `TOKEN_EXCHANGE_CONSENT_ENDPOINT`, `TOKEN_EXCHANGE_GRANT_TYPE`, `SUBJECT_TOKEN_TYPE`

### 2. `client/public/env-config.js` (browser, committed)

Primary UI configuration: eSignet UI base URL, `MOCK_RELYING_PARTY_SERVER_URL` (Express), `RESOURCE_SERVER_URL` (Django farmer-registry demo), token-exchange audience/scope, ACRs, claims, etc. This file is loaded before the React bundle.

### 3. `client/.env` (optional)

`REACT_APP_*` variables are **fallbacks** if `window._env_` does not define a key (see `env()` helpers in components).

---

## User flow (happy path)

1. Open `http://localhost:3000` and start **Sign in with eSignet** (PKCE).
2. After redirect to `/userprofile` or `/callback`, the app posts the `code` to **`POST /fetchUserInfo`** on port 5000; the server exchanges the code and returns userinfo + access token.
3. On the dashboard, **Token exchange (Agriculture)** calls **`POST /tokenExchange`**. If eSignet returns `consent_required` / `consent_uri`, complete consent in the browser, then **Record consent & retry** (calls **`POST /tokenExchangeConsent`**).
4. **Open farmer portal** navigates to `RESOURCE_SERVER_URL/farmer/#token=...` with the opaque token in the fragment so it is not sent as a normal page load query string.

---

## Main HTTP API (Express)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/fetchUserInfo` | Body: `code`, `client_id`, `redirect_uri`, `code_verifier` → tokens + userinfo |
| POST | `/tokenExchange` | Body: `accessToken`, `client_id`, optional `audience`, `scope`, … → eSignet token exchange |
| POST | `/tokenExchangeConsent` | Body: consent context + `accessToken` / `psuToken` → eSignet consent API |
| GET | `/health` | `{"status":"ok","service":"fayda-oidc-demo-mock-service-server"}` |
| POST | `/api/token`, `/api/userinfo` | Alternate paths used by some lab setups |

---

## Pairing with **Farmer registry demo**

Keep both services under the same parent directory:

- `farmer-registry-demo` — run Django on **8000** with farmer-only `.env` (introspection).
- `fayda-oidc-demo-mock-service` — set `RESOURCE_SERVER_URL` to `http://localhost:8000` in `env-config.js`.

---

## Troubleshooting

- **CORS** — Ensure `CORS_ORIGIN` includes the exact React origin (scheme + host + port).
- **Consent HTTP 401** — Server retries Bearer / body combinations; ensure access token is still valid after the consent redirect; verify `TOKEN_EXCHANGE_CONSENT_ENDPOINT` / `ESIGNET_SERVICE_URL`.
- **Redirect mismatch** — `REDIRECT_URI` in eSignet, `server/.env`, and `env-config.js` must match character-for-character.

---

## Related repositories

- `../farmer-registry-demo` — Django introspection + `/farmer` UI.
- `../mock-token-exchange-services` — Reference mock UI, Node RP service, Node farmer-registry.
