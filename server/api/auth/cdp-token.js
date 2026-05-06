import app from '../../dist/app.js';

export default function handler(req, res) {
  req.url = '/auth/cdp-token';
  return app(req, res);
}
