import app from '../dist/app.js';

export default function handler(req, res) {
  req.url = '/health';
  return app(req, res);
}
