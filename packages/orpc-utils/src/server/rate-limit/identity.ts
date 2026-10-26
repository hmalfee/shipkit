import { isIP } from 'node:net';

import ipaddr from 'ipaddr.js';

import type { Logger } from '@shipkit/telemetry/logger';
import type { IPv4, IPv6 } from 'ipaddr.js';

type Addr = IPv4 | IPv6;
type Cidr = [range: Addr, bits: number];
type ClientIpConfig = {
    /** Lowercase header name, or 'socket' for the TCP peer. */
    header: string;
    trustedProxies: readonly Cidr[];
};
export type ClientIpOptions = {
    /** Defaults to 'socket' (the TCP peer). Or any header name a trusted proxy sets. Case-insensitive. */
    header?: string;
    /** IPs or CIDRs, e.g. ['173.245.48.0/20', '2400:cb00::/32']. */
    trustedProxies?: readonly string[];
};

const WARN_INTERVAL_MS = 5 * 60_000;
/** Throttle state for warnings, keyed by warning type. */
const lastWarnAt = new Map<string, number>();

const warnThrottled = (logger: Logger, key: string, message: string) => {
    const now = Date.now();
    if (now - (lastWarnAt.get(key) ?? 0) < WARN_INTERVAL_MS) return;
    lastWarnAt.set(key, now);
    logger.warn(message);
};

const parseTrusted = (entry: string): Cidr => {
    try {
        if (entry.includes('/')) return ipaddr.parseCIDR(entry);
        const addr = ipaddr.process(entry);
        return [addr, addr.kind() === 'ipv4' ? 32 : 128];
    } catch {
        throw new Error(
            `[RateLimit] Invalid TRUSTED_PROXIES entry: "${entry}"`,
        );
    }
};

/**
 * Builds the config once at startup. Throws on bad input, so a broken proxy
 * setup fails the deploy instead of keying every user to one address.
 */
export const createClientIpConfig = ({
    header: rawHeader = 'socket',
    trustedProxies = [],
}: ClientIpOptions = {}): ClientIpConfig => {
    const header = rawHeader.trim().toLowerCase();
    // Token characters only. Anything else would make headers.get() throw.
    if (header !== 'socket' && !/^[\w-]+$/.test(header)) {
        throw new Error(
            `[RateLimit] Invalid CLIENT_IP_HEADER: "${rawHeader}". Use 'socket' or a header name.`,
        );
    }
    const cidrs = trustedProxies.map(parseTrusted);
    if (header !== 'socket' && !cidrs.length) {
        throw new Error(
            `[RateLimit] CLIENT_IP_HEADER="${header}" requires TRUSTED_PROXIES. Without it, every request is keyed to the proxy's own address.`,
        );
    }
    return { header, trustedProxies: cidrs };
};

/** Strips zone IDs. ipaddr.process() unwraps IPv4-mapped IPv6 (::ffff:1.2.3.4 -> 1.2.3.4). */
const toAddr = (text: string | null | undefined): Addr | undefined => {
    const value = text?.trim().split('%')[0];
    return value && isIP(value) ? ipaddr.process(value) : undefined;
};

const isTrusted = ({ trustedProxies }: ClientIpConfig, addr: Addr): boolean =>
    trustedProxies.some(
        ([range, bits]) =>
            addr.kind() === range.kind() &&
            // Kinds match, so this is safe. ipaddr.js types match() per family.
            (addr as IPv4).match(range as IPv4, bits),
    );

/**
 * Each proxy appends the address it received from, so walk right to left and
 * skip our own proxies. The first untrusted entry is the client. Anything to
 * its left is client-controlled and never read. A malformed entry stops the
 * walk: don't guess.
 */
const clientFromForwardedFor = (
    value: string,
    config: ClientIpConfig,
): Addr | undefined => {
    for (const raw of value.split(',').reverse()) {
        const hop = toAddr(raw);
        if (!hop) return undefined;
        if (!isTrusted(config, hop)) return hop;
    }
    return undefined;
};

/**
 * Returns the rate-limit bucket for the client, or undefined if no valid IP
 * can be determined. Proxy headers are read only when the TCP peer is trusted.
 */
export const resolveIpBucket = ({
    headers,
    config,
    socketIp,
    logger,
}: {
    headers: Headers;
    config: ClientIpConfig;
    socketIp?: string;
    logger: Logger;
}): string | undefined => {
    const peer = toAddr(socketIp);
    let addr = peer;
    if (config.header !== 'socket') {
        if (!peer || !isTrusted(config, peer)) {
            warnThrottled(
                logger,
                'untrusted-peer',
                `[RateLimit] CLIENT_IP_HEADER is "${config.header}" but the connection from ${socketIp ?? 'unknown'} is not in TRUSTED_PROXIES. Rate limiting by connection address. If this server is behind a proxy, add its address to TRUSTED_PROXIES.`,
            );
        } else {
            const value = headers.get(config.header);
            addr =
                config.header === 'x-forwarded-for'
                    ? clientFromForwardedFor(value ?? '', config)
                    : toAddr(value);
        }
    }
    if (!addr) {
        warnThrottled(
            logger,
            'no-ip',
            '[RateLimit] No valid client IP. Check CLIENT_IP_HEADER and TRUSTED_PROXIES.',
        );
        return undefined;
    }
    // One person controls a whole /64, so bucket IPv6 by prefix.
    return addr.kind() === 'ipv6'
        ? `${Buffer.from(addr.toByteArray().slice(0, 8)).toString('hex')}/64`
        : addr.toString();
};
