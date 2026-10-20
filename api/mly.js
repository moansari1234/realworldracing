// Vercel serverless proxy for the Mapillary Graph API (v4).
// The client token lives only in the MLY_TOKEN env var, never in the shipped bundle.
// GET /api/mly?p=map_features|images&bbox=w,s,e,n[&fields=..][&limit=..]
const FIELDS = {
  map_features: ['id', 'object_value', 'geometry'],
  images: ['id', 'computed_geometry', 'geometry', 'compass_angle', 'computed_compass_angle', 'thumb_256_url', 'is_pano', 'camera_type'],
};
const MAX_LIMIT = { map_features: 2000, images: 100 };

export default async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const send = (code, obj, cache = 'no-store') => { res.statusCode = code; res.setHeader('Cache-Control', cache); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
  try {
    const u = new URL(req.url, 'http://local');
    const p = u.searchParams.get('p');
    if (!FIELDS[p]) return send(400, { error: 'unknown endpoint' });
    const bb = (u.searchParams.get('bbox') || '').split(',').map(Number);
    if (bb.length !== 4 || bb.some(v => !Number.isFinite(v))) return send(400, { error: 'bad bbox' });
    const [w, s, e, n] = bb;
    // Mapillary rejects bbox areas >= 0.01 deg^2; keep the proxy far below that so it can't be used for bulk scraping
    if (e <= w || n <= s || (e - w) * (n - s) > 0.0004) return send(400, { error: 'bbox too large' });
    const want = (u.searchParams.get('fields') || FIELDS[p].join(',')).split(',').filter(f => FIELDS[p].includes(f));
    const limit = Math.max(1, Math.min(MAX_LIMIT[p], parseInt(u.searchParams.get('limit') || '500', 10) || 500));
    const tok = process.env.MLY_TOKEN;
    if (!tok) return send(503, { error: 'street detail not configured' });
    const q = new URLSearchParams({ fields: want.join(','), bbox: bb.map(v => v.toFixed(6)).join(','), limit: String(limit) });
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
    let r;
    try { r = await fetch(`https://graph.mapillary.com/${p}?${q}`, { headers: { Authorization: `OAuth ${tok}` }, signal: ctl.signal }); }
    finally { clearTimeout(t); }
    const body = await r.text();
    // an empty answer is sometimes a transient Mapillary hiccup: cache it only briefly
    const empty = /^\{"data":\[\]\}/.test(body);
    return send(r.status, body, r.ok ? (empty ? 'public, s-maxage=300, max-age=60' : 'public, s-maxage=86400, max-age=3600, stale-while-revalidate=604800') : 'no-store');
  } catch (err) {
    return send(502, { error: 'upstream failed' });
  }
};
