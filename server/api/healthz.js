import app from '../dist/app.js';

export default function handler(req, res) {
  req.url = '/healthz';
  return app(req, res);
}
