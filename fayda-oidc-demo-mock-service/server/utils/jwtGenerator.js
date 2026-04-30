import { randomUUID } from 'crypto';
import { importJWK, SignJWT } from 'jose';

export const generateSignedJwt = async () => {
  const { CLIENT_ID, TOKEN_ENDPOINT, ESIGNET_AUD_URL, PRIVATE_KEY_BASE64 } = process.env;

  const header = { alg: 'RS256', typ: 'JWT' };

  /** Match mock-relying-party-service: aud is token endpoint URL (ESIGNET_AUD_URL). */
  const aud = ESIGNET_AUD_URL || TOKEN_ENDPOINT;

  const payload = {
    iss: CLIENT_ID,
    sub: CLIENT_ID,
    aud,
  };

  const jwkJson = Buffer.from(PRIVATE_KEY_BASE64, 'base64').toString();
  const jwk = JSON.parse(jwkJson);
  const privateKey = await importJWK(jwk, 'RS256');

  return await new SignJWT(payload)
    .setProtectedHeader(header)
    .setIssuedAt()
    .setExpirationTime('2h')
    .setJti(randomUUID())
    .sign(privateKey);
};