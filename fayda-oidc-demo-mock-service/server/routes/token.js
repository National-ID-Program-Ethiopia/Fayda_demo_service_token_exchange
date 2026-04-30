import express from 'express';
import axios from 'axios';
import { generateSignedJwt } from '../utils/jwtGenerator.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const { code, code_verifier, redirect_uri, client_id } = req.body || {};

  if (!code) return res.status(400).json({ error: 'Missing code' });
  if (!code_verifier) return res.status(400).json({ error: 'Missing code_verifier' });

  try {
    const jwt = await generateSignedJwt();

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect_uri || process.env.REDIRECT_URI,
      client_id: client_id || process.env.CLIENT_ID,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: jwt,
      code_verifier
    });

    const response = await axios.post(
      process.env.TOKEN_ENDPOINT,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    res.json({ access_token: response.data.access_token });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Token request failed' });
  }
});

export default router;