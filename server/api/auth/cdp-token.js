import app from '../../src/app.js';

export default function handler(req, res) {
  req.url = '/auth/cdp-token';
  return app(req, res);
}
