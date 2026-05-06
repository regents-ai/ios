import app from '../../dist/app.js';
export default function handler(req, res) {
  req.url = '/server/api';
  return app(req, res);
}
