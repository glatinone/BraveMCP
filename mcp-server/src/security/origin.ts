// The HTTP bridge (index.ts) is reachable from any process on localhost,
// including JavaScript running on *any website open in the browser*, and
// from *any other installed browser extension* — CORS/origin checks are the
// only thing standing between an untrusted sender and this API.
//
// A scheme-only check (chrome-extension://.../moz-extension://...) is
// necessary but not sufficient: every installed extension gets an equally
// legitimate chrome-extension://<its-own-id> origin, so that check alone
// would let a malicious or compromised *neighbor* extension talk to this
// bridge exactly as freely as BraveMCP's own extension. That is the same
// "unauthenticated internal channel trusts any sender" gap disclosed in
// Claude for Chrome's extension-messaging vulnerability (2026-07): a
// same-shape architecture (extension + local backend + sensitive data)
// silently trusted any installed extension as a sender.
//
// Since a browser can't be tricked into lying about which extension sent a
// request, pinning the *specific* origin seen on first contact (TOFU — the
// same trust model SSH uses for host keys) closes this with no user
// configuration: only the one extension that talks to this bridge first is
// ever trusted again. A mismatched-but-still-extension-shaped origin is a
// stronger signal than an ordinary website origin, so it's logged and
// rejected distinctly (see index.ts).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ALLOWED_ORIGIN_SCHEMES = ["chrome-extension://", "moz-extension://"];

export function isAllowedOrigin(origin: string | undefined | null): boolean {
  if (!origin) return true;
  return ALLOWED_ORIGIN_SCHEMES.some((scheme) => origin.startsWith(scheme));
}

export type OriginDecision =
  | { allow: true; pinnedOrigin: string | null }
  | { allow: false; pinnedOrigin: string | null };

/**
 * Pure decision core (no I/O) so it's testable without touching the
 * filesystem. `pinnedOrigin` is whatever origin (if any) is currently
 * trusted; the returned `pinnedOrigin` is what the caller should persist
 * afterward (unchanged unless this call newly pins on first contact).
 */
export function decideOrigin(
  origin: string | undefined | null,
  pinnedOrigin: string | null
): OriginDecision {
  if (!origin) return { allow: true, pinnedOrigin };
  if (!isAllowedOrigin(origin)) return { allow: false, pinnedOrigin };
  if (!pinnedOrigin) return { allow: true, pinnedOrigin: origin };
  return { allow: origin === pinnedOrigin, pinnedOrigin };
}

const getTrustPath = (): string => {
  if (process.env.BRAVEMCP_TRUST_PATH) return process.env.BRAVEMCP_TRUST_PATH;
  return join(__dirname, "..", "..", "..", "storage", "trusted-origin.json");
};

export function loadPinnedOrigin(path: string = getTrustPath()): string | null {
  try {
    if (!existsSync(path)) return null;
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return typeof data.origin === "string" ? data.origin : null;
  } catch {
    return null;
  }
}

export function savePinnedOrigin(origin: string, path: string = getTrustPath()): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ origin, pinnedAt: Date.now() }, null, 2));
  } catch (error) {
    console.error("Failed to persist trusted extension origin:", error);
  }
}
