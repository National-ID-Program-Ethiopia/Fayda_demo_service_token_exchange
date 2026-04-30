import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express';
import cors from 'cors';

import axios from 'axios';
import https from 'https';
import tokenRoute from './routes/token.js';
import userinfoRoute from './routes/userinfo.js';
import { generateSignedJwt } from './utils/jwtGenerator.js';

const requiredEnvVars = ['TOKEN_ENDPOINT', 'USERINFO_ENDPOINT', 'CLIENT_ID', 'REDIRECT_URI'];
const missingEnvVars = requiredEnvVars.filter((k) => !process.env[k]);
if (missingEnvVars.length) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}. ` +
      `Check server/.env (loaded from ${path.join(__dirname, '.env')}).`
  );
}

const app = express();
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

app.use('/api/token', tokenRoute);
app.use('/api/userinfo', userinfoRoute);

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

function mkTrace(req) {
  const hdr = req.get('x-request-id') || req.get('x-correlation-id') || req.get('x-trace-id');
  const id = hdr || `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  return { traceId: id, start: Date.now(), path: req.path };
}

function maskToken(t) {
  if (!t) return null;
  const s = String(t);
  if (s.length <= 16) return `${s.slice(0, 4)}…${s.slice(-2)}`;
  return `${s.slice(0, 10)}…${s.slice(-6)} (len=${s.length})`;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'esignet-rp-demo-server' });
});

function deriveEsignetServiceBase() {
  if (process.env.ESIGNET_SERVICE_URL) return String(process.env.ESIGNET_SERVICE_URL).replace(/\/$/, '');
  const te = String(process.env.TOKEN_ENDPOINT || '');
  // .../v1/esignet/oauth/v2/token → .../v1/esignet
  const idx = te.indexOf('/oauth/');
  if (idx > 0) return te.slice(0, idx).replace(/\/$/, '');
  return '';
}

function tokenExchangeEndpoint() {
  if (process.env.TOKEN_EXCHANGE_ENDPOINT) return process.env.TOKEN_EXCHANGE_ENDPOINT;
  // Derive from token endpoint: .../oauth/v2/token → .../oauth/token-exchange
  return String(process.env.TOKEN_ENDPOINT).replace(/\/oauth\/v2\/token\/?$/, '/oauth/token-exchange');
}

function tokenExchangeConsentEndpoint() {
  if (process.env.TOKEN_EXCHANGE_CONSENT_ENDPOINT) return process.env.TOKEN_EXCHANGE_CONSENT_ENDPOINT;
  const base = deriveEsignetServiceBase();
  if (!base) return '';
  return `${base}/token-exchange/consent`;
}

/**
 * POST /fetchUserInfo
 * Body: { code, client_id, redirect_uri, code_verifier }
 * Returns: { userInfo, accessToken, token_type }
 */
app.post('/fetchUserInfo', async (req, res) => {
  const tr = mkTrace(req);
  const { code, client_id, redirect_uri, code_verifier } = req.body || {};
  if (!code || !client_id || !redirect_uri) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'code, client_id, redirect_uri required',
    });
  }
  if (!code_verifier) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'code_verifier required (PKCE)',
    });
  }

  try {
    const client_assertion = await generateSignedJwt();
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri,
      client_id,
      client_assertion_type:
        process.env.CLIENT_ASSERTION_TYPE || 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion,
      code_verifier,
    });

    const tokenResp = await axios.post(process.env.TOKEN_ENDPOINT, form.toString(), {
      httpsAgent,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      validateStatus: () => true,
    });

    if (tokenResp.status !== 200) {
      return res.status(tokenResp.status).json(tokenResp.data);
    }

    const accessToken = tokenResp.data?.access_token;
    if (!accessToken) {
      return res.status(502).json({
        error: 'server_error',
        error_description: 'Missing access_token in token response',
        tokenResponse: tokenResp.data,
      });
    }

    const userinfoResp = await axios.get(process.env.USERINFO_ENDPOINT, {
      httpsAgent,
      headers: { Authorization: `Bearer ${accessToken}` },
      validateStatus: () => true,
    });

    if (userinfoResp.status !== 200) {
      return res.status(userinfoResp.status).json(userinfoResp.data);
    }

    return res.json({
      userInfo: userinfoResp.data, // often a signed/encrypted JWT string in many deployments
      accessToken,
      token_type: tokenResp.data?.token_type,
      traceId: tr.traceId,
      accessTokenMasked: maskToken(accessToken),
    });
  } catch (e) {
    console.error(e?.response?.data || e.message);
    return res.status(500).json({ error: 'server_error', error_description: e.message });
  }
});

/**
 * POST /tokenExchange
 * Body: { accessToken, client_id, audience?, scope?, redirect_uri?, state?, nonce?, response_type? }
 * Proxies to eSignet RFC8693 token exchange.
 */
app.post('/tokenExchange', async (req, res) => {
  const tr = mkTrace(req);
  const {
    accessToken,
    client_id,
    audience = process.env.TOKEN_EXCHANGE_TARGET_AUDIENCE,
    scope = process.env.TOKEN_EXCHANGE_SCOPE,
    redirect_uri = process.env.REDIRECT_URI,
    state,
    nonce,
    response_type = process.env.TE_RESPONSE_TYPE || 'code',
  } = req.body || {};

  if (!accessToken || !client_id) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'accessToken and client_id required',
    });
  }

  try {
    const client_assertion = await generateSignedJwt();
    const grantType =
      process.env.TOKEN_EXCHANGE_GRANT_TYPE || 'urn:ietf:params:oauth:grant-type:token-exchange';
    const subjectTokenType =
      process.env.SUBJECT_TOKEN_TYPE || 'urn:ietf:params:oauth:token-type:access_token';

    const form = new URLSearchParams({
      grant_type: grantType,
      subject_token_type: subjectTokenType,
      subject_token: accessToken,
      audience: audience || '',
      scope: scope || '',
      client_id,
      client_assertion_type:
        process.env.CLIENT_ASSERTION_TYPE || 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion,
    });
    if (redirect_uri) form.set('redirect_uri', redirect_uri);
    if (state) form.set('state', state);
    if (nonce) form.set('nonce', nonce);
    if (response_type) form.set('response_type', response_type);

    const r = await axios.post(tokenExchangeEndpoint(), form.toString(), {
      httpsAgent,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      validateStatus: () => true,
    });

    const body = r.data;
    return res.status(r.status >= 400 ? r.status : 200).send({
      ...body,
      traceId: tr.traceId,
    });
  } catch (e) {
    console.error(e?.response?.data || e.message);
    return res.status(500).json({ error: 'server_error', error_description: e.message });
  }
});

/**
 * POST /tokenExchangeConsent
 * Body: { accessToken, clientId, psuToken?, sourceAudience, targetAudience, grantedScopes[] }
 * Mirrors mock-relying-party-service behavior (JSON body to /token-exchange/consent).
 */
app.post('/tokenExchangeConsent', async (req, res) => {
  const tr = mkTrace(req);
  const {
    accessToken,
    clientId,
    psuToken,
    sourceAudience,
    targetAudience,
    grantedScopes = [],
  } = req.body || {};

  if (!clientId || !sourceAudience || !targetAudience) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'clientId, sourceAudience, targetAudience required',
    });
  }
  if (!accessToken && !psuToken) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Either accessToken (Bearer) or psuToken is required',
    });
  }

  const endpoint = tokenExchangeConsentEndpoint();
  if (!endpoint) {
    return res.status(500).json({
      error: 'server_error',
      error_description:
        'Cannot derive consent endpoint. Set ESIGNET_SERVICE_URL or TOKEN_EXCHANGE_CONSENT_ENDPOINT.',
    });
  }

  const body = {
    requestTime: new Date().toISOString(),
    request: {
      clientId,
      ...(psuToken ? { psuToken } : {}),
      sourceAudience,
      targetAudience,
      grantedScopes: Array.isArray(grantedScopes) ? grantedScopes : [],
      delegationMode: 'NONE',
      actorIdentity: '',
    },
  };

  const baseHeaders = { 'Content-Type': 'application/json' };
  const withAuthHeaders = accessToken ? { ...baseHeaders, Authorization: `Bearer ${accessToken}` } : baseHeaders;
  // Primary attempt:
  // - If psuToken provided: try WITHOUT Authorization first (matches mock-token-exchange-services behavior).
  // - Else: send Bearer access token.
  const primaryHeaders = psuToken ? baseHeaders : withAuthHeaders;

  const bodyWithoutPsu = {
    requestTime: body.requestTime,
    request: {
      clientId,
      sourceAudience,
      targetAudience,
      grantedScopes: Array.isArray(grantedScopes) ? grantedScopes : [],
      delegationMode: 'NONE',
      actorIdentity: '',
    },
  };

  try {
    let r = await axios.post(endpoint, body, {
      httpsAgent,
      headers: primaryHeaders,
      validateStatus: () => true,
    });
    // Some eSignet deployments still require Authorization even when psuToken is present.
    // If we have both accessToken and psuToken and get 401, retry once WITH Authorization.
    if (r.status === 401 && psuToken && accessToken) {
      r = await axios.post(endpoint, body, {
        httpsAgent,
        headers: withAuthHeaders,
        validateStatus: () => true,
      });
    }
    // If psuToken in JSON is wrong/stale, Bearer sub may still authorize — retry without psuToken in body.
    if (r.status === 401 && psuToken && accessToken) {
      r = await axios.post(endpoint, bodyWithoutPsu, {
        httpsAgent,
        headers: withAuthHeaders,
        validateStatus: () => true,
      });
    }
    return res.status(r.status >= 400 ? r.status : 200).send({ ...r.data, traceId: tr.traceId });
  } catch (e) {
    console.error(e?.response?.data || e.message);
    return res.status(500).json({ error: 'server_error', error_description: e.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));