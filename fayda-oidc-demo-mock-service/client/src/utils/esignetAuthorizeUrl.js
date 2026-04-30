/**
 * Build OIDC /authorize URL (same behavior as mock-relying-party-ui `buildEsignetAuthorizeUrl`).
 * Appends most params raw (env may be pre-encoded); `claims` object is JSON-stringified then encodeURI().
 */
export function buildEsignetAuthorizeUrl(cfg, codeChallenge, codeChallengeMethod) {
  const {
    authorizeUri,
    nonce,
    state,
    client_id,
    redirect_uri,
    scope,
    response_type,
    acr_values,
    claims,
    claims_locales,
    display,
    prompt,
    max_age,
    ui_locales,
  } = cfg;

  let url = authorizeUri;

  const append = (key, value, raw = true) => {
    if (value === undefined || value === null || value === '') return;
    const sep = url.includes('?') ? '&' : '?';
    const v = raw ? String(value) : encodeURIComponent(String(value));
    url += sep + key + '=' + v;
  };

  if (nonce) append('nonce', nonce, true);
  if (state) {
    append('state', state, true);
  } else {
    const randomNum = new Uint32Array(1);
    crypto.getRandomValues(randomNum);
    const randomState = randomNum[0].toString(36).substring(5);
    append('state', randomState, true);
  }
  if (client_id) append('client_id', client_id, true);
  if (redirect_uri) append('redirect_uri', redirect_uri, true);
  if (scope) append('scope', scope, true);
  if (response_type) append('response_type', response_type, true);
  else append('response_type', 'code', true);
  if (acr_values) append('acr_values', acr_values, true);
  if (claims != null) {
    const sep = url.includes('?') ? '&' : '?';
    url += sep + 'claims=' + encodeURI(JSON.stringify(claims));
  }
  if (claims_locales) append('claims_locales', claims_locales, true);
  if (display) append('display', display, true);
  if (prompt) append('prompt', prompt, true);
  if (max_age !== undefined && max_age !== null && max_age !== '')
    append('max_age', max_age, true);
  if (ui_locales) append('ui_locales', ui_locales, true);

  if (codeChallenge && codeChallengeMethod) {
    append('code_challenge', codeChallenge, true);
    append('code_challenge_method', codeChallengeMethod, true);
  }

  return url;
}
