import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { badRequest } from './errors.js'

/**
 * /api/execute makes the server send requests to user-supplied URLs, which is
 * an SSRF surface: without these checks an authenticated user could aim the
 * proxy at localhost, the MongoDB port, cloud metadata endpoints, or anything
 * else on the server's internal network.
 *
 * Residual risk, documented deliberately: the target is checked by resolving
 * DNS *before* the request, and redirects are not followed (the executor uses
 * redirect: 'manual'), but a hostile DNS server that answers differently on the
 * fetch's own lookup (DNS rebinding) could still slip through. Closing that
 * requires pinning the connection to the pre-checked IP; revisit before
 * exposing Xenon beyond trusted users.
 */

function isPrivateIPv4(ip: string): boolean {
  const octets = ip.split('.').map(Number)
  const a = octets[0] ?? -1
  const b = octets[1] ?? -1
  return (
    a === 0 || // "this network", includes 0.0.0.0
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') {
    return true // unspecified / loopback
  }
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true // link-local fe80::/10
  }
  if (lower.startsWith('fc') || lower.startsWith('fd')) {
    return true // unique-local fc00::/7
  }
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
  if (mapped?.[1]) {
    return isPrivateIPv4(mapped[1]) // IPv4-mapped, e.g. ::ffff:127.0.0.1
  }
  return false
}

function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return isPrivateIPv4(ip)
  if (version === 6) return isPrivateIPv6(ip)
  return true // unparseable — refuse rather than guess
}

const blocked = () =>
  badRequest(
    'target_blocked',
    'That URL resolves to a private or internal address, which the request runner will not call.',
  )

/**
 * Rejects URLs pointing at localhost, private ranges (10.x, 172.16-31.x,
 * 192.168.x), link-local/metadata (169.254.x), CGNAT, and their IPv6
 * equivalents. Hostnames are resolved and every returned address is checked.
 */
export async function assertPublicTarget(url: string): Promise<void> {
  const { hostname } = new URL(url)
  // URL brackets IPv6 hosts ([::1]); strip for isIP/lookup.
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw blocked()
  }

  if (isIP(host)) {
    if (isPrivateAddress(host)) throw blocked()
    return
  }

  let addresses
  try {
    addresses = await lookup(host, { all: true, verbatim: true })
  } catch {
    throw badRequest('target_dns_failed', `Could not resolve host "${host}".`)
  }

  if (addresses.length === 0 || addresses.some((addr) => isPrivateAddress(addr.address))) {
    throw blocked()
  }
}
