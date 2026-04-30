import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as jose from 'jose';
import { peekPkceCodeVerifier, clearPkceCodeVerifier } from '../utils/pkce';
import BankLayout from './layout/BankLayout';

const STORAGE_TE_CTX = 'esignet_mock_te_ctx';
const STORAGE_OPAQUE = 'esignet_farmer_opaque';
const STORAGE_USER = 'capital_bank_user';
const STORAGE_TE_SKIP_CODE_KEY = 'esignet_mock_te_skip_code_exchange';

function env(key, fallback) {
  // eslint-disable-next-line no-underscore-dangle
  const v = window._env_ && window._env_[key];
  if (v !== undefined && v !== null && String(v).length) return String(v);
  const ev = process.env[`REACT_APP_${key}`];
  if (ev !== undefined && ev !== null && String(ev).length) return String(ev);
  return fallback;
}

function displayName(u) {
  if (!u || typeof u !== 'object') return 'N/A';
  return u.name || u.given_name || u.preferred_username || u.sub || 'N/A';
}

function tePsuFromSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_USER);
    if (!raw) return '';
    const u = JSON.parse(raw);
    return u && u.sub ? String(u.sub) : '';
  } catch (_) {
    return '';
  }
}

function storeTeCtxFromConsentUri(consentUrl, fallbackTargetAudience, txScope) {
  try {
    const u = new URL(consentUrl);
    const sourceAudience = u.searchParams.get('source_audience') || env('CLIENT_ID', '');
    const targetAudience =
      u.searchParams.get('target_audience') || fallbackTargetAudience || env('TOKEN_EXCHANGE_TARGET_AUDIENCE', '');
    const grantedScopes = String(txScope || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const psuToken = (env('TOKEN_EXCHANGE_PSU_TOKEN', '').trim() || tePsuFromSession() || '').trim();
    sessionStorage.setItem(
      STORAGE_TE_CTX,
      JSON.stringify({
        clientId: env('CLIENT_ID', ''),
        sourceAudience,
        targetAudience,
        grantedScopes,
        ...(psuToken ? { psuToken } : {}),
      })
    );
  } catch (_) {
    /* ignore */
  }
}

function setSkipTeCodeExchangeFlag() {
  try {
    sessionStorage.setItem(STORAGE_TE_SKIP_CODE_KEY, '1');
  } catch (_) {
    /* ignore */
  }
}

function navigateToConsent(consentUri) {
  if (!consentUri || typeof consentUri !== 'string') return false;
  try {
    setSkipTeCodeExchangeFlag();
    try {
      sessionStorage.setItem('esignet_mock_te_auto_run', '1');
    } catch (_) {
      /* ignore */
    }
    window.location.assign(consentUri);
    return true;
  } catch (_) {
    return false;
  }
}

const Callback = () => {
  const [userInfo, setUserInfo] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [exchangeResult, setExchangeResult] = useState(null);
  const [consentUri, setConsentUri] = useState(null);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const [teAttempted, setTeAttempted] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const pushLog = (line) => {
    setLog((prev) => [...prev, `${new Date().toISOString()} ${line}`]);
  };

  useEffect(() => {
    const fetchUserInfo = async (code) => {
      try {
        setError(null);
        // New login flow should not inherit an old exchanged opaque token.
        try {
          sessionStorage.removeItem(STORAGE_OPAQUE);
        } catch (_) {
          /* ignore */
        }
        const serverBase = env('MOCK_RELYING_PARTY_SERVER_URL', 'http://localhost:5000').replace(/\/$/, '');
        const clientId = env('CLIENT_ID', '');
        const redirectUri = env('REDIRECT_URI', 'http://localhost:3000/callback');

        const codeVerifier = peekPkceCodeVerifier();
        if (!codeVerifier) {
          // If user just returned from token-exchange consent UI, the `code` is not for OIDC login.
          // Skip code→token exchange and keep the existing bank session.
          let skipTeCode = false;
          try {
            skipTeCode = !!sessionStorage.getItem(STORAGE_TE_SKIP_CODE_KEY);
            if (skipTeCode) sessionStorage.removeItem(STORAGE_TE_SKIP_CODE_KEY);
          } catch (_) {
            skipTeCode = false;
          }
          if (skipTeCode) {
            pushLog('Returned from token-exchange consent. Retry token exchange.');
            navigate('/app', { replace: true });
            return;
          }
          // This can happen when landing here from token-exchange consent UI (code belongs to another app),
          // or if the user opened the callback URL directly.
          let existing;
          try {
            existing = sessionStorage.getItem('esignet_mrp_access_token');
          } catch (_) {
            existing = null;
          }
          if (existing) {
            setAccessToken(existing);
            // If we already have a valid session access token, treat this as a stale/foreign callback and go to dashboard.
            try {
              const raw = sessionStorage.getItem(STORAGE_USER);
              if (raw) setUserInfo(JSON.parse(raw));
              else setUserInfo({ name: 'Session active', sub: 'session' });
            } catch (_) {
              setUserInfo({ name: 'Session active', sub: 'session' });
            }
            setWarning('Session already active. Ignoring callback code (missing PKCE verifier).');
            navigate('/app', { replace: true });
            return;
          }
          setError('Missing PKCE code_verifier in storage. Start sign-in from / and try again.');
          return;
        }

        const response = await axios.post(
          `${serverBase}/fetchUserInfo`,
          {
            code,
            client_id: clientId,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          },
          { validateStatus: () => true }
        );

        if (response.status !== 200) {
          const msg =
            response.data?.error_description ||
            response.data?.error ||
            `fetchUserInfo failed (${response.status})`;
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }

        clearPkceCodeVerifier();

        const { userInfo: rawUserInfo, accessToken: at } = response.data || {};
        setAccessToken(at);
        sessionStorage.setItem('esignet_mrp_access_token', at);
        pushLog('OIDC login OK — access token stored in session.');

        const decodedUserInfo = await decodeUserInfoResponse(rawUserInfo);
        const u = decodedUserInfo || rawUserInfo;
        setUserInfo(u);
        try {
          sessionStorage.setItem(STORAGE_USER, JSON.stringify(u));
          if (u && u.sub) sessionStorage.setItem('esignet_mock_psu_token', String(u.sub));
        } catch (_) {
          /* ignore */
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error fetching token or user info:', err);
        setError(err?.response?.data?.error_description || err?.message || 'Request failed');
      }
    };

    const query = new URLSearchParams(location.search);
    const code = query.get('code');

    if (code) {
      fetchUserInfo(code);
    }
  }, [location.search]);

  // Prefer landing users on the Capital Bank dashboard.
  useEffect(() => {
    if (!userInfo) return;
    const autoExchange = env('AUTO_TOKEN_EXCHANGE_AFTER_LOGIN', 'false') === 'true';
    if (!autoExchange) {
      navigate('/app', { replace: true });
      return;
    }
    // If consent is required, we keep them on this page.
    if (consentUri) return;
    // If token exchange succeeded, go to dashboard.
    if (exchangeResult?.access_token) {
      navigate('/app', { replace: true });
    }
  }, [userInfo, exchangeResult, consentUri, navigate]);

  const runTokenExchangeRequest = async () => {
    const serverBase = env('MOCK_RELYING_PARTY_SERVER_URL', 'http://localhost:5000').replace(/\/$/, '');
    const clientId = env('CLIENT_ID', '');
    const audience = env('TOKEN_EXCHANGE_TARGET_AUDIENCE', '');
    const scope = env('TOKEN_EXCHANGE_SCOPE', 'openid profile');
    const redirectUri = env('REDIRECT_URI', 'http://localhost:3000/callback');

    const at = accessToken || sessionStorage.getItem('esignet_mrp_access_token');
    if (!at) throw new Error('Missing access token. Sign in again.');

    pushLog(`Requesting token exchange → audience=${audience} ...`);
    const r = await axios.post(
      `${serverBase}/tokenExchange`,
      {
        accessToken: at,
        client_id: clientId,
        audience,
        scope,
        redirect_uri: redirectUri,
        state: env('TE_STATE', 'esignet-rp-demo'),
        nonce: env('TE_NONCE', 'esignet-rp-demo-nonce'),
        response_type: env('TE_RESPONSE_TYPE', 'code'),
      },
      { validateStatus: () => true }
    );

    setExchangeResult(r.data);
    if (r.data?.consent_uri) {
      setConsentUri(r.data.consent_uri);
      storeTeCtxFromConsentUri(r.data.consent_uri, audience, scope);
      pushLog('consent_required — open consent, then retry token exchange.');
      setWarning(r.data?.error_description || 'Consent required to exchange token.');
      setError(null);
    } else {
      setConsentUri(null);
    }

    if (r.status !== 200 || r.data?.error) {
      if (r.data?.consent_uri) {
        // Consent required is not a fatal error — user action needed.
        return r.data;
      }
      const msg = r.data?.error_description || r.data?.error || `token exchange HTTP ${r.status}`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }

    if (r.data?.access_token) {
      sessionStorage.setItem(STORAGE_OPAQUE, r.data.access_token);
    }
    pushLog('Exchange OK — opaque token received.');
    setError(null);
    setWarning(null);
    return r.data;
  };

  const doTokenExchange = async () => {
    setBusy(true);
    try {
      setError(null);
      setWarning(null);
      setExchangeResult(null);
      setConsentUri(null);
      setTeAttempted(true);
      try {
        sessionStorage.removeItem(STORAGE_TE_CTX);
      } catch (_) {
        /* ignore */
      }
      await runTokenExchangeRequest();

      const autoOpen = env('AUTO_OPEN_FARMER_PORTAL_AFTER_EXCHANGE', 'false') === 'true';
      const tok = (() => {
        try {
          return sessionStorage.getItem(STORAGE_OPAQUE);
        } catch (_) {
          return null;
        }
      })();
      if (autoOpen && tok) {
        pushLog('Auto-opening farmer portal…');
        openFarmerPortal();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e?.response?.data || e.message);
      setError(e?.message || 'Token exchange failed');
    } finally {
      setBusy(false);
    }
  };

  const recordConsentAndRetry = async () => {
    setBusy(true);
    try {
      setError(null);
      const serverBase = env('MOCK_RELYING_PARTY_SERVER_URL', 'http://localhost:5000').replace(/\/$/, '');
      const at = accessToken || sessionStorage.getItem('esignet_mrp_access_token');
      let ctxRaw;
      try {
        ctxRaw = sessionStorage.getItem(STORAGE_TE_CTX);
      } catch (_) {
        ctxRaw = null;
      }
      if (!at || !ctxRaw) {
        setError('No consent context. Run token exchange first until you receive a consent_uri.');
        return;
      }
      let ctx;
      try {
        ctx = JSON.parse(ctxRaw);
      } catch {
        setError('Invalid consent context in storage.');
        return;
      }

      // Always send accessToken when present so the server can retry with Bearer
      // (matches mock-relying-party-service + CrossSectorPanel; mutual exclusion caused 401s when psu env was set).
      const psuOpt = (ctx?.psuToken || env('TOKEN_EXCHANGE_PSU_TOKEN', '') || tePsuFromSession() || '').trim();
      const body = {
        accessToken: at,
        clientId: ctx.clientId || env('CLIENT_ID', ''),
        sourceAudience: ctx.sourceAudience,
        targetAudience: ctx.targetAudience,
        grantedScopes: ctx.grantedScopes || [],
        ...(psuOpt ? { psuToken: psuOpt } : {}),
      };

      const r = await axios.post(`${serverBase}/tokenExchangeConsent`, body, { validateStatus: () => true });
      if (r.status !== 200) {
        const msg = r.data?.errors?.[0]?.message || r.data?.message || JSON.stringify(r.data);
        throw new Error(`Consent API HTTP ${r.status}: ${msg}`);
      }

      setConsentUri(null);
      pushLog('Consent recorded. Retrying token exchange…');
      await runTokenExchangeRequest();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e?.response?.data || e.message);
      setError(e?.message || 'Record consent failed');
    } finally {
      setBusy(false);
    }
  };

  const openFarmerPortal = () => {
    const resourceBase = env('RESOURCE_SERVER_URL', 'http://localhost:8000').replace(/\/$/, '');
    const token =
      exchangeResult?.access_token ||
      (() => {
        return null;
      })();
    if (!token) {
      setWarning('Run token exchange first to obtain an opaque token.');
      return;
    }
    // Pass token in URL fragment so it is NOT sent to the server in HTTP request.
    window.location.assign(`${resourceBase}/farmer/#token=${encodeURIComponent(token)}`);
  };

  const maskedExchangeResult = (() => {
    if (!exchangeResult || typeof exchangeResult !== 'object') return exchangeResult;
    const tok = exchangeResult.access_token;
    const masked =
      tok && typeof tok === 'string'
        ? `${tok.slice(0, 6)}…${tok.slice(-4)} (len=${tok.length})`
        : tok;
    // Avoid rendering consent_uri / traceId in UI.
    // eslint-disable-next-line no-unused-vars
    const { consent_uri, traceId, ...rest } = exchangeResult;
    return { ...rest, access_token: masked };
  })();

  const u = userInfo;

  return (
    <BankLayout title="Signing you in…" user={userInfo}>
      <div style={{ maxWidth: 980 }}>
        {error ? (
          <div style={{ background: '#5b1b1b', padding: 12, borderRadius: 10, marginBottom: 12, textAlign: 'left' }}>
            <strong>Error:</strong> {typeof error === 'string' ? error : JSON.stringify(error)}
          </div>
        ) : null}
        {warning ? (
          <div style={{ background: '#3a2a07', padding: 12, borderRadius: 10, marginBottom: 12, textAlign: 'left', color: '#fde68a' }}>
            <strong>Warning:</strong> {typeof warning === 'string' ? warning : JSON.stringify(warning)}
          </div>
        ) : null}

        {u ? (
          <div style={styles.card}>
            <div style={{ padding: 18 }}>
              <div style={{ fontWeight: 950, color: '#fde68a' }}>Secure sign-in</div>
              <div style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.55, marginTop: 6 }}>
                Validating eKYC session and preparing cross-sector access. Welcome, {displayName(u)}.
              </div>
            </div>
          </div>
        ) : (
          <p>Loading…</p>
        )}

        {u ? (
          <div style={styles.card}>
            <div style={{ padding: 18 }}>
              <div style={{ fontWeight: 950, color: '#fde68a' }}>Cross-sector services (Token exchange)</div>
              <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                Exchange your banking portal token to access Agriculture sector services. If consent is required, complete
                the consent flow then retry.
              </div>

              {teAttempted && consentUri ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 10,
                    background: '#3a2a07',
                    color: '#fde68a',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Consent required</div>
                  <div style={{ fontSize: 12, marginBottom: 8 }}>
                    Open the consent URL (or use “Record consent &amp; retry” if your deployment accepts the consent
                    API). Then run <strong>1. Token exchange</strong> again.
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => navigateToConsent(consentUri)}
                      style={{
                        backgroundColor: '#f59e0b',
                        color: '#111827',
                        padding: '10px 12px',
                        border: 'none',
                        borderRadius: 10,
                        cursor: busy ? 'progress' : 'pointer',
                        fontWeight: 800,
                      }}
                    >
                      Continue to consent
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        try {
                          setSkipTeCodeExchangeFlag();
                          sessionStorage.setItem('esignet_mock_te_auto_run', '1');
                        } catch (_) {
                          /* ignore */
                        }
                        window.open(consentUri, '_blank', 'noopener,noreferrer');
                      }}
                      style={{
                        backgroundColor: 'transparent',
                        color: '#fde68a',
                        padding: '10px 12px',
                        border: '1px solid rgba(253, 230, 138, .6)',
                        borderRadius: 10,
                        cursor: busy ? 'progress' : 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Open in new tab
                    </button>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(253,230,138,.85)' }}>
                    If you need the raw URL for debugging, copy it from your browser address bar after clicking.
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
                <button type="button" disabled={busy} onClick={doTokenExchange} style={{ ...styles.btn, width: 240 }}>
                  Token exchange (Agriculture)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={recordConsentAndRetry}
                  style={{ ...styles.btnSecondary, width: 260 }}
                >
                  Record consent &amp; retry
                </button>
                <button type="button" disabled={busy} onClick={openFarmerPortal} style={{ ...styles.btn, width: 240 }}>
                  View farmer profile
                </button>
              </div>

              <pre style={{ textAlign: 'left', marginTop: 16, whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 220, overflow: 'auto', background: '#0f3460', padding: 12, borderRadius: 10 }}>
                {log.length ? log.join('\n') : 'Logs appear here.'}
              </pre>

              {/* Do not render raw exchange results / error payloads. */}
            </div>
          </div>
        ) : null}
      </div>
    </BankLayout>
  );
};

const decodeUserInfoResponse = async (userinfoJwtToken) => {
  try {
    if (!userinfoJwtToken) return null;
    if (typeof userinfoJwtToken !== 'string') return userinfoJwtToken;
    if (!userinfoJwtToken.includes('.')) return userinfoJwtToken;
    return jose.decodeJwt(userinfoJwtToken);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error decoding JWT user info:', error);
    return null;
  }
};

const styles = {
  card: {
    borderRadius: 16,
    background: 'rgba(15,23,42,.55)',
    border: '1px solid rgba(148,163,184,.16)',
    boxShadow: '0 24px 70px rgba(0,0,0,.30)',
    marginBottom: 14,
  },
  btn: {
    backgroundColor: '#f8c94e',
    color: '#1a1a2e',
    padding: '12px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  btnSecondary: {
    backgroundColor: '#1e3a5f',
    color: '#e2e8f0',
    padding: '12px',
    border: '1px solid #f8c94e',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 'bold',
  },
};

export default Callback;
