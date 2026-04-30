import express from 'express';
import axios from 'axios';

const router = express.Router();

router.post('/', async (req, res) => {
  const { access_token } = req.body;

  if (!access_token) return res.status(400).json({ error: 'Missing access token' });

  try {
    const response = await axios.get(process.env.USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Userinfo request failed' });
  }
});

export default router;