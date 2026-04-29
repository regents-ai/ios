import app from '../../src/app.js';

export default function handler(req, res) {
  const slug = req.query?.slug;
  const path = Array.isArray(slug) ? slug.join('/') : typeof slug === 'string' ? slug : '';
  const queryIndex = req.url?.indexOf('?') ?? -1;
  const query = queryIndex >= 0 && req.url ? req.url.slice(queryIndex) : '';

  req.url = `/mobile/${path}${query}`;
  return app(req, res);
}
