# Fayda demo service — token exchange (monorepo)

This folder groups two demo services under one parent directory:

- `fayda-oidc-demo-mock-service` (React + Express): OIDC login (PKCE) + optional  token exchange + consent flow.
- `farmer-registry-demo` (Django): resource server demo that introspects opaque tokens (runs on **port 8000**).

---

## Run the Django resource server (port 8000)

```bash
cd /home/amani/Documents/nidp/fayda_demo_service_token_exchange/farmer-registry-demo
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
cp .env.example .env
python manage.py runserver 0.0.0.0:8000
```

---

## Run the OIDC demo mock service (React + Express)

```bash
cd /home/amani/Documents/nidp/fayda_demo_service_token_exchange/fayda-oidc-demo-mock-service
cp server/.env.example server/.env
cp client/.env.example client/.env
npm install
npm install --prefix client
npm install --prefix server
npm run dev
```

- UI: `http://localhost:3000`
- API: `http://localhost:5000`

Make sure `client/public/env-config.js` has `RESOURCE_SERVER_URL` set to `http://localhost:8000`.

