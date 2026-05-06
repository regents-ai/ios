import app from '../dist/app.js';

export default function handler(req, res) {
  req.url = '/push-tokens';
  return app(req, res);
}
