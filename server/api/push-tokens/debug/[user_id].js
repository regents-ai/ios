import app from '../../../dist/app.js';

export default function handler(req, res) {
  const userId = req.query?.user_id;
  const encodedUserId = Array.isArray(userId) ? userId[0] : userId;

  req.url = `/push-tokens/debug/${encodeURIComponent(encodedUserId || '')}`;
  return app(req, res);
}
