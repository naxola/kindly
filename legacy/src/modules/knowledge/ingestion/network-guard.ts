/**
 * SSRF guard for user-supplied URLs (Fase 7f). Once a signed-in ADMIN can
 * paste a URL into the UI, the server must not be turnable into a proxy to
 * its own network (localhost, cloud metadata at 169.254.169.254, the VPC).
 * `isPrivateAddress` is pure; `assertPublicHost` resolves the hostname and
 * refuses if *any* resolved address is non-public.
 *
 * Known residual: DNS can answer differently between this check and the
 * `fetch` that follows (rebinding). Acceptable here — the caller is an
 * authenticated ADMIN, not anonymous — and closing it needs a pinned-IP
 * dispatcher, not justified yet (`CLAUDE.md` §2).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIPv4(address: string): boolean {
  const [a, b] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    a >= 224 // multicast + reserved + broadcast
  );
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return isPrivateIPv4(address);
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) {
      return isPrivateIPv4(mapped[1]);
    }
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb") || // link-local fe80::/10
      lower.startsWith("fc") ||
      lower.startsWith("fd") || // unique local fc00::/7
      lower.startsWith("ff") // multicast
    );
  }
  return true; // not an IP at all: treat as unsafe
}

export type HostResolver = (hostname: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (hostname) =>
  (await lookup(hostname, { all: true })).map((entry) => entry.address);

export async function assertPublicHost(url: URL, resolve: HostResolver = defaultResolver): Promise<void> {
  // URL keeps IPv6 literals in brackets.
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [hostname] : await resolve(hostname);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error(`Refusing to fetch ${url.hostname}: it does not resolve to a public address.`);
  }
}
