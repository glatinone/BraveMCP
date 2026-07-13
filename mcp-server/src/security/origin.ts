// The HTTP bridge (index.ts) is reachable from any process on localhost,
// including JavaScript running on *any website open in the browser* — CORS is
// the only thing standing between a malicious page and this API. Only the
// extension itself (chrome-extension://<id>, moz-extension://<id> origins)
// should be allowed to call it; a request with no Origin header at all is
// assumed to be a same-machine, non-browser client (curl, tests) rather than
// a cross-site browser request, since browsers always attach Origin to
// fetch()/XHR calls.
const ALLOWED_ORIGIN_SCHEMES = ["chrome-extension://", "moz-extension://"];

export function isAllowedOrigin(origin: string | undefined | null): boolean {
  if (!origin) return true;
  return ALLOWED_ORIGIN_SCHEMES.some((scheme) => origin.startsWith(scheme));
}
