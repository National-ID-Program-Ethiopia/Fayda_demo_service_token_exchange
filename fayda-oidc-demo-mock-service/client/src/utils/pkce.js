/** Same storage key as mock-relying-party-ui (`mock-relying-party-ui/src/utils/pkce.js`). */
export const PKCE_STORAGE_KEY = 'esignet_mock_pkce_code_verifier';

function randomUrlSafeString(length) {
  const charset =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += charset[bytes[i] % charset.length];
  }
  return out;
}

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function createPkcePair({ verifierLength = 64 } = {}) {
  const codeVerifier = randomUrlSafeString(verifierLength);
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const codeChallenge = base64UrlEncode(digest);
  return { codeVerifier, codeChallenge, codeChallengeMethod: 'S256' };
}

export function rememberPkceCodeVerifier(codeVerifier) {
  try {
    localStorage.setItem(PKCE_STORAGE_KEY, codeVerifier);
    sessionStorage.setItem(PKCE_STORAGE_KEY, codeVerifier);
  } catch (_) {
    /* private mode / quota */
  }
}

export function peekPkceCodeVerifier() {
  try {
    return (
      localStorage.getItem(PKCE_STORAGE_KEY) ||
      sessionStorage.getItem(PKCE_STORAGE_KEY) ||
      undefined
    );
  } catch (_) {
    return undefined;
  }
}

export function clearPkceCodeVerifier() {
  try {
    sessionStorage.removeItem(PKCE_STORAGE_KEY);
    localStorage.removeItem(PKCE_STORAGE_KEY);
  } catch (_) {
    /* ignore */
  }
}
