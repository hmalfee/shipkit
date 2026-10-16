import { isIP } from 'node:net';

import ipaddr from 'ipaddr.js';

import type { Logger } from '@shipkit/telemetry/logger';
import type { IPv4, IPv6 } from 'ipaddr.js';

type Addr = IPv4 | IPv6;
type Cidr = [range: Addr, bits: number];

export type ClientIpConfig = {
    /** Lowercase header name, or 'socket' for the TCP peer. */
    header: string;
    trustedProxies: readonly Cidr[];
};

/** Throttle state for warnings, keyed by warning type. */
const lastWarnAt = new Map<string, number>();

/**
 * Builds the config once at startup. Throws on bad input, so a broken proxy
 * setup fails the deploy instead of keying every user to one address.
 */
export const createClientIpConfig = ({
    header: rawHeader = 'socket',
    trustedProxies = [],
}: {
    /** Defaults to 'socket' (the TCP peer). Or any header name a trusted proxy sets. Case-insensitive. */
    header?: string | undefined;
    /** IPs or CIDRs, e.g. ['173.245.48.0/20', '2400:cb00::/32']. */
    trustedProxies?: readonly string[];
}): ClientIpConfig => {
    const header = rawHeader.trim().toLowerCase();

    // Token characters only. Anything else would make headers.get() throw.
    if (header !== 'socket' && !/^[\w-]+$/.test(header)) {
        throw new Error(
            `[RateLimit] Invalid CLIENT_IP_HEADER: "${rawHeader}". Use 'socket' or a header name.`,
        );
    }

    const cidrs = trustedProxies.map((entry): Cidr => {
        try {
            if (entry.includes('/')) return ipaddr.parseCIDR(entry);
            const addr = ipaddr.process(entry);
            return [addr, addr.kind() === 'ipv4' ? 32 : 128];
        } catch {
            throw new Error(
                `[RateLimit] Invalid TRUSTED_PROXIES entry: "${entry}"`,
            );
        }
    });

    if (header !== 'socket' && cidrs.length === 0) {
        throw new Error(
            `[RateLimit] CLIENT_IP_HEADER="${header}" requires TRUSTED_PROXIES. Without it, every request is keyed to the proxy's own address.`,
        );
    }

    return { header, trustedProxies: cidrs };
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
    // Strips zone IDs. ipaddr.process() unwraps IPv4-mapped IPv6 (::ffff:1.2.3.4 -> 1.2.3.4).
    const toAddr = (text: string | null | undefined): Addr | undefined => {
        const value = text?.trim().split('%')[0];
        return value && isIP(value) ? ipaddr.process(value) : undefined;
    };

    const trusted = (addr: Addr): boolean =>
        config.trustedProxies.some(
            ([range, bits]) =>
                addr.kind() === range.kind() &&
                // Kinds match, so this is safe. ipaddr.js types match() per family.
                (addr as IPv4).match(range as IPv4, bits),
        );

    const warn = (key: string, message: string) => {
        const now = Date.now();
        if (now - (lastWarnAt.get(key) ?? 0) < 5 * 60_000) return;
        lastWarnAt.set(key, now);
        logger.warn(message);
    };

    const peer = toAddr(socketIp);
    let addr = peer;

    if (config.header !== 'socket') {
        if (!peer || !trusted(peer)) {
            warn(
                'untrusted-peer',
                `[RateLimit] CLIENT_IP_HEADER is "${config.header}" but the connection from ${socketIp ?? 'unknown'} is not in TRUSTED_PROXIES. Rate limiting by connection address. If this server is behind a proxy, add its address to TRUSTED_PROXIES.`,
            );
        } else if (config.header === 'x-forwarded-for') {
            // Each proxy appends the address it received from, so walk right to
            // left and skip our own proxies. The first untrusted entry is the
            // client. Anything to its left is client-controlled and never read.
            addr = undefined;
            const hops = (headers.get(config.header) ?? '').split(',');
            for (let i = hops.length - 1; i >= 0; i--) {
                const hop = toAddr(hops[i]);
                if (!hop) break; // malformed entry: don't guess
                if (!trusted(hop)) {
                    addr = hop;
                    break;
                }
            }
        } else {
            addr = toAddr(headers.get(config.header));
        }
    }

    if (!addr) {
        warn(
            'no-ip',
            '[RateLimit] No valid client IP. Check CLIENT_IP_HEADER and TRUSTED_PROXIES.',
        );
        return undefined;
    }

    if (addr.kind() === 'ipv6') {
        // One person controls a whole /64, so bucket by prefix.
        const prefix = Buffer.from(addr.toByteArray().slice(0, 8)).toString(
            'hex',
        );
        return `${prefix}/64`;
    }
    return addr.toString();
};
