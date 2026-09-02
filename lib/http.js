/**
 * Minimal JSON response writer for the host route. Kept dependency-free so
 * the package does not depend on the community shared slices.
 */

/** Write one JSON response with the family-default headers. */
export function writeJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'referrer-policy': 'no-referrer',
    ...headers,
  })
  res.end(payload)
}
