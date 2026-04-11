/**
 * Protocol version negotiation and capability handshake.
 *
 * When a connection is established, both sides exchange HANDSHAKE frames.
 * The negotiated protocol version is the minimum of both sides' versions.
 * Capabilities are intersected: only features both sides support are active.
 */

import {
  type RpcFrame,
  FrameType,
  createHandshakeFrame,
} from './frame.js';
import type { Transport } from './transport.js';
import type { Logger } from './types.js';
import { silentLogger } from './types.js';

/** Current protocol version. Increment when making breaking wire changes. */
export const CURRENT_PROTOCOL_VERSION = 1;

/** Implementation identifier for this TypeScript runtime. */
export const TS_IMPLEMENTATION_ID = '@rpc-bridge/core-ts/0.1.0';

/** Well-known capability strings. */
export const Capabilities = {
  /** Credit-based flow control (REQUEST_N frames) */
  FLOW_CONTROL: 'flow_control',
  /** Deadline/timeout support */
  DEADLINE: 'deadline',
  /** Binary metadata values (base64-encoded in string map) */
  METADATA_BINARY: 'metadata_binary',
  /** Stream cancellation support */
  CANCELLATION: 'cancellation',
  /** Compressed payloads */
  COMPRESSION: 'compression',
} as const;

/** Default capabilities advertised by this implementation. */
export const DEFAULT_CAPABILITIES: string[] = [
  Capabilities.FLOW_CONTROL,
  Capabilities.DEADLINE,
  Capabilities.CANCELLATION,
];

/** Result of a completed handshake. */
export interface HandshakeResult {
  /** Negotiated protocol version (min of both sides). */
  protocolVersion: number;
  /** Intersection of capabilities supported by both sides. */
  capabilities: Set<string>;
  /** Peer's implementation identifier. */
  peerImplementationId: string;
}

/** Options shared by both performHandshake and acceptHandshake. */
interface HandshakeOptions {
  protocolVersion?: number;
  capabilities?: string[];
  implementationId?: string;
  timeoutMs?: number;
  logger?: Logger;
}

/**
 * Shared handshake logic. Waits for a peer HANDSHAKE frame, negotiates
 * version and capabilities, and optionally sends a frame before or after
 * receiving the peer's frame.
 *
 * @param transport - The transport to use.
 * @param opts - Resolved handshake options.
 * @param sendBefore - If provided, send this frame before waiting (client initiator).
 * @param sendAfter - If true, send our handshake frame after receiving the peer's (server responder).
 */
function doHandshake(
  transport: Transport,
  opts: {
    version: number;
    caps: string[];
    implId: string;
    timeoutMs: number;
    logger: Logger;
  },
  mode: 'initiator' | 'responder',
): Promise<HandshakeResult> {
  const { version, caps, implId, timeoutMs, logger } = opts;

  return new Promise<HandshakeResult>((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        unsubscribe();
        reject(new Error(`Handshake timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    const handler = (frame: RpcFrame) => {
      if (frame.type === FrameType.HANDSHAKE && !settled) {
        settled = true;
        clearTimeout(timeout);
        unsubscribe();

        const peerVersion = frame.protocolVersion ?? 1;
        const peerCaps = new Set(frame.capabilities ?? []);
        const negotiatedVersion = Math.min(version, peerVersion);
        const negotiatedCaps = new Set(caps.filter(c => peerCaps.has(c)));

        const result: HandshakeResult = {
          protocolVersion: negotiatedVersion,
          capabilities: negotiatedCaps,
          peerImplementationId: frame.implementationId ?? 'unknown',
        };

        // Responder sends its handshake frame after receiving the peer's
        if (mode === 'responder') {
          const responseFrame = createHandshakeFrame(version, caps, implId);
          logger.debug(`Sending handshake response: v${version}, caps=[${caps.join(',')}]`);
          transport.send(responseFrame);
        }

        logger.info(
          `Handshake ${mode === 'initiator' ? 'complete' : 'accepted'}: v${negotiatedVersion}, caps=[${[...negotiatedCaps].join(',')}], peer=${result.peerImplementationId}`,
        );
        resolve(result);
      }
    };

    const unsubscribe = transport.onFrame(handler);

    // Initiator sends its handshake frame immediately
    if (mode === 'initiator') {
      const handshakeFrame = createHandshakeFrame(version, caps, implId);
      logger.debug(`Sending handshake: v${version}, caps=[${caps.join(',')}]`);
      transport.send(handshakeFrame);
    }
  });
}

/**
 * Perform the handshake as the initiator (client side).
 * Sends our handshake frame and waits for the peer's response.
 */
export function performHandshake(
  transport: Transport,
  options?: HandshakeOptions,
): Promise<HandshakeResult> {
  return doHandshake(
    transport,
    {
      version: options?.protocolVersion ?? CURRENT_PROTOCOL_VERSION,
      caps: options?.capabilities ?? DEFAULT_CAPABILITIES,
      implId: options?.implementationId ?? TS_IMPLEMENTATION_ID,
      timeoutMs: options?.timeoutMs ?? 5000,
      logger: options?.logger ?? silentLogger,
    },
    'initiator',
  );
}

/**
 * Handle an incoming handshake (server side).
 * Waits for the peer's handshake frame, then sends our response.
 */
export function acceptHandshake(
  transport: Transport,
  options?: HandshakeOptions,
): Promise<HandshakeResult> {
  return doHandshake(
    transport,
    {
      version: options?.protocolVersion ?? CURRENT_PROTOCOL_VERSION,
      caps: options?.capabilities ?? DEFAULT_CAPABILITIES,
      implId: options?.implementationId ?? TS_IMPLEMENTATION_ID,
      timeoutMs: options?.timeoutMs ?? 5000,
      logger: options?.logger ?? silentLogger,
    },
    'responder',
  );
}
