import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const STORAGE_TE_CTX = 'esignet_mock_te_ctx';
const STORAGE_OPAQUE = 'esignet_farmer_opaque';
const STORAGE_AT = 'esignet_mrp_access_token';
const STORAGE_TE_SKIP_CODE_KEY = 'esignet_mock_te_skip_code_exchange';
const STORAGE_TE_AUTO = 'esignet_mock_te_auto_run';

function env(key, fallback) {
  // eslint-disable-next-line no-underscore-dangle
  const v = window._env_ && window._env_[key];
  if (v !== undefined && v !== null && String(v).length) return String(v);
  const ev = process.env[`REACT_APP_${key}`];
  if (ev !== undefined && ev !== null && String(ev).length) return String(ev);
  return fallback;
}

function tePsuFromSession() {
  try {
    const raw = sessionStorage.getItem('capital_bank_user');
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
    // Prefer OIDC `sub` from login (same as mock-relying-party-ui Sidenav); optional env override for lab setups.
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

function navigateToConsent(consentUri) {
  if (!consentUri || typeof consentUri !== 'string') return false;
  try {
    // Match mock-relying-party-ui behavior: navigate directly to consent_uri,
    // but set one-shot flags so the return redirect doesn't break login and
    // we can auto-run consent+retry.
    try {
      sessionStorage.setItem(STORAGE_TE_SKIP_CODE_KEY, '1');
      sessionStorage.setItem(STORAGE_TE_AUTO, '1');
    } catch (_) {
      /* ignore */
    }
    window.location.assign(consentUri);
    return true;
  } catch (_) {
    return false;
  }
}

export default function CrossSectorPanel({ title = 'Cross-sector services (Token exchange)' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [log, setLog] = useState([]);
  const [consentUri, setConsentUri] = useState(null);
  const [exchangeResult, setExchangeResult] = useState(null);
  const [teAttempted, setTeAttempted] = useState(false);

  const serverBase = useMemo(() => env('MOCK_RELYING_PARTY_SERVER_URL', 'http://localhost:5000').replace(/\/$/, ''), []);
  const resourceBase = useMemo(() => env('RESOURCE_SERVER_URL', 'http://localhost:8000').replace(/\/$/, ''), []);

  const pushLog = (line) => setLog((prev) => [...prev, `${new Date().toISOString()} ${line}`]);

  useEffect(() => {
    // Do NOT auto-reuse stored opaque tokens. User must run token exchange explicitly.
  }, []);

  // Auto-run consent recording + retry after returning from consent UI.
  useEffect(() => {
    let should = false;
    try {
      should = !!sessionStorage.getItem(STORAGE_TE_AUTO);
      if (should) sessionStorage.removeItem(STORAGE_TE_AUTO);
    } catch (_) {
      should = false;
    }
    if (!should) return;
    // Best-effort automation: record consent using stored ctx, then retry token exchange.
    // eslint-disable-next-line no-use-before-define
    recordConsentAndRetry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doTokenExchange = async () => {
    setBusy(true);
    try {
      setError(null);
      setWarning(null);
      setExchangeResult(null);
      setConsentUri(null);
      setTeAttempted(true);

      const clientId = env('CLIENT_ID', '');
      const audience = env('TOKEN_EXCHANGE_TARGET_AUDIENCE', '');
      const scope = env('TOKEN_EXCHANGE_SCOPE', 'openid profile');
      const redirectUri = env('REDIRECT_URI', 'http://localhost:3000/callback');

      let at = null;
      try {
        at = sessionStorage.getItem(STORAGE_AT);
      } catch (_) {
        at = null;
      }
      if (!at) throw new Error('Missing session access token. Sign in again.');

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
        pushLog('consent_required — open consent URL, then retry token exchange.');
        setWarning(r.data?.error_description || 'Consent required to exchange token.');
        // Do not auto-navigate. Show consent UI only after the user clicked token exchange.
        return;
      }

      if (r.status !== 200 || r.data?.error) {
        const msg = r.data?.error_description || r.data?.error || `token exchange HTTP ${r.status}`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }

      if (r.data?.access_token) {
        try {
          sessionStorage.setItem(STORAGE_OPAQUE, r.data.access_token);
        } catch (_) {
          /* ignore */
        }
      }

      pushLog('Exchange OK — opaque token received.');
      setError(null);
      setWarning(null);

      if (env('AUTO_OPEN_FARMER_PORTAL_AFTER_EXCHANGE', 'false') === 'true') {
        openFarmerPortal();
      }
    } catch (e) {
      setError(e?.message || 'Token exchange failed');
    } finally {
      setBusy(false);
    }
  };

  const recordConsentAndRetry = async () => {
    setBusy(true);
    try {
      setError(null);
      setWarning(null);
      const raw = sessionStorage.getItem(STORAGE_TE_CTX);
      if (!raw) throw new Error('No consent context. Run token exchange first until you receive a consent_uri.');
      const ctx = JSON.parse(raw);
      let at = null;
      try {
        at = sessionStorage.getItem(STORAGE_AT);
      } catch (_) {
        at = null;
      }
      const psuOpt = (ctx?.psuToken || env('TOKEN_EXCHANGE_PSU_TOKEN', '') || tePsuFromSession() || '').trim();
      const body = {
        // Match mock-relying-party-service: always send accessToken when available so the server can Bearer-retry.
        ...(at ? { accessToken: at } : {}),
        clientId: ctx.clientId || env('CLIENT_ID', ''),
        sourceAudience: ctx.sourceAudience,
        targetAudience: ctx.targetAudience,
        grantedScopes: ctx.grantedScopes || [],
        ...(psuOpt ? { psuToken: psuOpt } : {}),
      };

      pushLog('Recording consent via server…');
      const r = await axios.post(`${serverBase}/tokenExchangeConsent`, body, { validateStatus: () => true });
      if (r.status !== 200) {
        const msg = r.data?.error_description || r.data?.error || `consent HTTP ${r.status}`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
      pushLog('Consent recorded. Retrying token exchange…');
      await doTokenExchange();
    } catch (e) {
      setWarning(e?.message || 'Consent recording failed');
    } finally {
      setBusy(false);
    }
  };

  const openFarmerPortal = () => {
    const token = (() => {
      if (exchangeResult?.access_token && typeof exchangeResult.access_token === 'string') return exchangeResult.access_token;
      return null;
    })();
    if (!token) {
      setWarning('Run token exchange first to obtain an opaque token.');
      return;
    }
    window.location.assign(`${resourceBase}/farmer/#token=${encodeURIComponent(token)}`);
  };

  return (
    <div style={styles.card}>
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 950, color: '#fde68a' }}>{title}</div>
        <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
          Exchange your banking portal token to access Agriculture sector services. If consent is required, complete the
          consent flow then retry.
        </div>

        {teAttempted && consentUri ? (
          <div style={styles.notice}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Consent required</div>
            <div style={{ fontSize: 12, marginBottom: 10 }}>
              First time only: open consent, approve, then come back and click <strong>Token exchange</strong> again.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => navigateToConsent(consentUri)}
                style={styles.btn}
              >
                Continue to consent
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  try {
                    sessionStorage.setItem(STORAGE_TE_SKIP_CODE_KEY, '1');
                    sessionStorage.setItem(STORAGE_TE_AUTO, '1');
                  } catch (_) {
                    /* ignore */
                  }
                  window.open(consentUri, '_blank', 'noopener,noreferrer');
                }}
                style={styles.btnSecondary}
              >
                Open in new tab
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-start', flexWrap: 'wrap', marginTop: 14 }}>
          <button type="button" disabled={busy} onClick={doTokenExchange} style={styles.btn}>
            Token exchange (Agriculture)
          </button>
          <button type="button" disabled={busy} onClick={recordConsentAndRetry} style={styles.btnSecondary}>
            Record consent &amp; retry
          </button>
          <button type="button" disabled={busy} onClick={openFarmerPortal} style={styles.btn}>
            Open farmer portal
          </button>
        </div>

        {error ? (
          <div style={styles.err}>
            <strong>Error:</strong> {String(error)}
          </div>
        ) : null}
        {warning ? (
          <div style={styles.warn}>
            <strong>Warning:</strong> {String(warning)}
          </div>
        ) : null}

        <pre style={styles.pre}>{log.length ? log.join('\n') : 'Logs appear here.'}</pre>

        {/* Do not display raw exchange responses (consent_uri/traceId). */}
      </div>
    </div>
  );
}

const styles = {
  card: {
    borderRadius: 16,
    background: 'rgba(15,23,42,.55)',
    border: '1px solid rgba(148,163,184,.16)',
    boxShadow: '0 24px 70px rgba(0,0,0,.30)',
    marginTop: 14,
  },
  notice: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    background: 'rgba(245,158,11,.12)',
    border: '1px solid rgba(245,158,11,.35)',
    color: '#fde68a',
  },
  err: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    background: 'rgba(239,68,68,.12)',
    border: '1px solid rgba(239,68,68,.35)',
    color: '#fecaca',
    fontSize: 12,
  },
  warn: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    background: 'rgba(245,158,11,.12)',
    border: '1px solid rgba(245,158,11,.35)',
    color: '#fde68a',
    fontSize: 12,
  },
  btn: {
    borderRadius: 12,
    padding: '10px 12px',
    border: 'none',
    background: 'linear-gradient(90deg, #f8c94e, #f59e0b)',
    color: '#0b1220',
    fontWeight: 900,
    cursor: 'pointer',
  },
  btnSecondary: {
    borderRadius: 12,
    padding: '10px 12px',
    border: '1px solid rgba(248,201,78,.35)',
    background: 'rgba(248,201,78,.08)',
    color: '#fde68a',
    fontWeight: 900,
    cursor: 'pointer',
  },
  pre: {
    textAlign: 'left',
    marginTop: 14,
    whiteSpace: 'pre-wrap',
    fontSize: 11,
    maxHeight: 160,
    overflow: 'auto',
    background: '#0b1220',
    border: '1px solid rgba(148,163,184,.12)',
    padding: 12,
    borderRadius: 12,
    color: '#cbd5e1',
  },
  preSmall: {
    textAlign: 'left',
    marginTop: 12,
    whiteSpace: 'pre-wrap',
    fontSize: 11,
    maxHeight: 220,
    overflow: 'auto',
    background: '#0b1220',
    border: '1px solid rgba(148,163,184,.12)',
    padding: 12,
    borderRadius: 12,
    color: '#cbd5e1',
  },
};

