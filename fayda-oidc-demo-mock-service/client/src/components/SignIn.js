import React, { useMemo, useState } from "react";
import { createPkcePair, rememberPkceCodeVerifier } from "../utils/pkce";
import { buildEsignetAuthorizeUrl } from "../utils/esignetAuthorizeUrl";

function env(key, fallback) {
  // eslint-disable-next-line no-underscore-dangle
  const v = window._env_ && window._env_[key];
  if (v !== undefined && v !== null && String(v).length) return String(v);
  const ev = process.env[`REACT_APP_${key}`];
  if (ev !== undefined && ev !== null && String(ev).length) return String(ev);
  return fallback;
}

function randomStateNonce() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

function parseClaimsFromEnv(raw) {
  if (!raw) return undefined;
  try {
    const s = String(raw).trim().startsWith("%") ? decodeURIComponent(String(raw)) : String(raw);
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function debugEnabled() {
  return env("MOCK_DEBUG_OIDC", "false") === "true";
}

function debug(...args) {
  if (!debugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log("[OIDC]", ...args);
}

const SignIn = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const authorizeUri = useMemo(() => {
    const base = env("ESIGNET_UI_BASE_URL", "https://esignet.oracle1.fayda.et").replace(/\/$/, "");
    return `${base}/authorize`;
  }, []);

  const startEsignet = async () => {
    try {
      setError(null);
      setBusy(true);
      const clientId = env("CLIENT_ID", "");
      const redirectUri = env("REDIRECT_URI", "http://localhost:3000/userprofile");
      const { codeVerifier, codeChallenge, codeChallengeMethod } = await createPkcePair();
      rememberPkceCodeVerifier(codeVerifier);

      const claimsRaw = env("CLAIMS_USER_PROFILE", "");
      const claims = parseClaimsFromEnv(claimsRaw);
      const acrValues = env("ACRS", "");
      const scope = env("SCOPE_USER_PROFILE", env("SCOPE", "openid profile resident-service"));

      const url = buildEsignetAuthorizeUrl(
        {
          authorizeUri,
          redirect_uri: redirectUri,
          client_id: clientId,
          scope,
          nonce: randomStateNonce(),
          state: randomStateNonce(),
          response_type: "code",
          acr_values: acrValues || undefined,
          claims,
          claims_locales: env("CLAIMS_LOCALES", "en,am,om,aa"),
          display: env("DISPLAY", "page"),
          prompt: env("PROMPT", "consent"),
          max_age: env("MAX_AGE", "21"),
          ui_locales: env("UI_LOCALES", "en"),
        },
        codeChallenge,
        codeChallengeMethod
      );

      debug("Navigating to authorize", { redirectUri, clientId });
      window.location.assign(url);
    } catch (e) {
      setError(e?.message || String(e));
      setBusy(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.left}>
        <div style={styles.hero}>
          <img src="/national-id-logo.svg" alt="" width={72} height={72} style={styles.heroLogo} />
          <h2 style={styles.heroTitle}>CAPITAL BANK</h2>
          <p style={styles.heroText}>
            Sign in with Fayda eKYC to access your banking dashboard. After login, we can exchange your token to access
            cross-sector services (Agriculture → Farmer Registry).
          </p>
        </div>
      </div>

      <div style={styles.right}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Welcome</h1>
          <p style={styles.sub}>Banking portal (OIDC + PKCE + token exchange)</p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
            }}
            style={{ textAlign: "left" }}
          >
            <label style={styles.label}>Username</label>
            <input type="text" placeholder="Username" style={styles.input} readOnly />
            <label style={styles.label}>Password</label>
            <input type="password" placeholder="Password" style={styles.input} readOnly />
            <button type="button" style={{ ...styles.btn, opacity: 0.55, cursor: "not-allowed" }} disabled>
              Sign in (demo only)
            </button>
          </form>

          <div style={styles.divider}>
            <span style={styles.dividerText}>or</span>
          </div>

          <button
            type="button"
            onClick={startEsignet}
            disabled={busy}
            style={{
              ...styles.primaryBtn,
              opacity: busy ? 0.7 : 1,
              cursor: busy ? "progress" : "pointer",
            }}
          >
            {busy ? "Redirecting…" : "Sign in with Fayda E-Signet"}
          </button>

          {error ? (
            <div style={styles.errBox}>
              <strong>Sign-in error:</strong> {error}
            </div>
          ) : null}
        </div>
        <footer style={styles.footer}>&copy; 2026 National ID. All rights reserved.</footer>
      </div>
    </div>
  );
};

const styles = {
  page: {
    margin: 0,
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "1fr minmax(360px, 440px)",
    fontFamily: "system-ui, Segoe UI, Roboto, Arial, sans-serif",
    background: "#0b1220",
    color: "#e2e8f0",
  },
  left: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    background: "linear-gradient(145deg, #0f3460 0%, #1a1a2e 55%, #162447 100%)",
  },
  hero: { maxWidth: 420, textAlign: "center" },
  heroLogo: { filter: "drop-shadow(0 8px 24px rgba(0,0,0,.35))" },
  heroTitle: { margin: "18px 0 8px", fontSize: 28, color: "#f8c94e", fontWeight: 700 },
  heroText: { margin: 0, lineHeight: 1.55, color: "#cbd5e1", fontSize: 15 },
  right: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "48px 32px",
    background: "#111827",
  },
  card: {
    background: "#162447",
    borderRadius: 16,
    padding: "32px 28px",
    boxShadow: "0 24px 60px rgba(0,0,0,.45)",
    border: "1px solid #223056",
    textAlign: "center",
  },
  heading: { margin: "0 0 6px", color: "#f8fafc", fontSize: 26, fontWeight: 700 },
  sub: { margin: "0 0 22px", color: "#94a3b8", fontSize: 14 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 12px",
    marginBottom: 14,
    borderRadius: 10,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e2e8f0",
    outline: "none",
  },
  btn: {
    width: "100%",
    padding: "12px",
    borderRadius: 10,
    border: "none",
    background: "#f8c94e",
    color: "#0f172a",
    fontWeight: 700,
    fontSize: 15,
    marginTop: 4,
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: "22px 0",
    color: "#64748b",
    fontSize: 13,
  },
  dividerText: { whiteSpace: "nowrap" },
  primaryLink: {
    // legacy (unused)
    display: "none",
  },
  primaryBtn: {
    width: "100%",
    boxSizing: "border-box",
    textAlign: "center",
    padding: "14px 16px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(90deg, #2f8ea3, #1d6b7c)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 15,
  },
  errBox: {
    marginTop: 12,
    textAlign: "left",
    padding: 10,
    borderRadius: 10,
    background: "rgba(239, 68, 68, .10)",
    border: "1px solid rgba(239, 68, 68, .35)",
    color: "#fecaca",
    fontSize: 13,
  },
  footer: { marginTop: 28, textAlign: "center", fontSize: 12, color: "#64748b" },
};

export default SignIn;
