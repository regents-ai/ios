import app from '../../dist/app.js';

export default function handler(req, res) {
  req.url = '/.well-known/jwks.json';
  return app(req, res);
}
