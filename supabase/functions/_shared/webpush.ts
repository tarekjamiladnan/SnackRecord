// Dependency-free Web Push sender for Supabase Edge Functions (Deno).
// Implements:
//   - RFC 8292 (VAPID): ES256 JWT signed with the server's P-256 key
//   - RFC 8291 (Message Encryption): "aes128gcm" content encoding
// Everything uses the platform WebCrypto API; no third-party packages.
//
// Key formats expected (as produced by `npx web-push generate-vapid-keys`):
//   publicKey  -> base64url of the 65-byte uncompressed P-256 point (starts with 0x04)
//   privateKey -> base64url of the 32-byte private scalar

const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function base64UrlToBytes(value: string): Uint8Array {
  const clean = String(value).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const index = B64URL_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base64url character');
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let result = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result += B64URL_ALPHABET[(buffer >> bits) & 0x3f];
    }
  }
  if (bits > 0) result += B64URL_ALPHABET[(buffer << (6 - bits)) & 0x3f];
  return result;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ---------------------------------------------------------------------------
// P-256 scalar multiplication. WebCrypto cannot import a bare private scalar,
// so we derive the uncompressed public point ourselves (only needed once per
// cold start; cached at module level).
// ---------------------------------------------------------------------------

const P_CURVE = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const A_CURVE = (P_CURVE - 3n);
const ORDER_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const GENERATOR_X = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n;
const GENERATOR_Y = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n;

type Point = { x: bigint; y: bigint };

const mod = (value: bigint): bigint => ((value % P_CURVE) + P_CURVE) % P_CURVE;

function invert(value: bigint): bigint {
  let result = 1n;
  let exponent = P_CURVE - 2n;
  let base = mod(value);
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % P_CURVE;
    base = (base * base) % P_CURVE;
    exponent >>= 1n;
  }
  return result;
}

function pointDouble(point: Point): Point | null {
  if (mod(point.y) === 0n) return null;
  const lambda = mod(mod(3n * point.x * point.x + A_CURVE) * invert(2n * point.y));
  const x = mod(lambda * lambda - 2n * point.x);
  const y = mod(lambda * (point.x - x) - point.y);
  return { x, y };
}

function pointAdd(first: Point | null, second: Point | null): Point | null {
  if (!first) return second ? { ...second } : null;
  if (!second) return { ...first };
  if (first.x === second.x && mod(first.y + second.y) === 0n) return null;
  if (first.x === second.x && first.y === second.y) return pointDouble(first);
  const lambda = mod(mod(second.y - first.y) * invert(mod(second.x - first.x)));
  const x = mod(lambda * lambda - first.x - second.x);
  const y = mod(lambda * (first.x - x) - first.y);
  return { x, y };
}

function scalarMultiply(k: bigint, point: Point): Point | null {
  let result: Point | null = null;
  let addend: Point | null = { ...point };
  let scalar = k;
  while (scalar > 0n) {
    if (scalar & 1n) result = pointAdd(result, addend);
    scalar >>= 1n;
    if (scalar > 0n) addend = pointAdd(addend, addend);
  }
  return result;
}

function bigIntTo32Bytes(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = Number((value >> BigInt(8 * (31 - i))) & 0xffn);
  return out;
}

interface DerivedPublicKey {
  raw: Uint8Array;
  x: bigint;
  y: bigint;
}

function derivePublicKey(privateScalarBytes: Uint8Array): DerivedPublicKey {
  if (privateScalarBytes.length !== 32) throw new Error('VAPID private key must decode to 32 bytes');
  const hex = Array.from(privateScalarBytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const d = BigInt('0x' + hex);
  if (d === 0n || d >= ORDER_N) throw new Error('VAPID private key out of range');
  const point = scalarMultiply(d, { x: GENERATOR_X, y: GENERATOR_Y });
  if (!point) throw new Error('Invalid VAPID private key');
  const raw = concat(new Uint8Array([0x04]), bigIntTo32Bytes(point.x), bigIntTo32Bytes(point.y));
  return { raw, x: point.x, y: point.y };
}

// ---------------------------------------------------------------------------
// VAPID JWT
// ---------------------------------------------------------------------------

interface VapidContext {
  publicRaw: Uint8Array;
  privateKey: CryptoKey;
  /** audience origin -> signed JWT (valid 12h; cache avoids re-signing per send) */
  jwtCache: Map<string, string>;
}

let vapidContext: VapidContext | null = null;

async function loadVapid(publicKeyB64Url: string, privateKeyB64Url: string): Promise<VapidContext> {
  const expectedPublicRaw = base64UrlToBytes(publicKeyB64Url);
  const privateKeyBytes = base64UrlToBytes(privateKeyB64Url);
  if (
    vapidContext &&
    vapidContext.jwtCache.size <= 100 &&
    constantTimeEqual(vapidContext.publicRaw, expectedPublicRaw)
  ) {
    return vapidContext;
  }

  const derived = derivePublicKey(privateKeyBytes);
  if (!constantTimeEqual(derived.raw, expectedPublicRaw)) {
    throw new Error('VAPD public/private key pair mismatch');
  }

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToBase64Url(bigIntTo32Bytes(derived.x)),
    y: bytesToBase64Url(bigIntTo32Bytes(derived.y)),
    d: bytesToBase64Url(privateKeyBytes),
    ext: true,
    key_ops: ['sign']
  };
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  vapidContext = { publicRaw: expectedPublicRaw, privateKey, jwtCache: new Map() };
  return vapidContext;
}

async function vapidAuthorizationHeader(vapid: VapidContext, audience: string, subject: string): Promise<string> {
  const cachedJwt = vapid.jwtCache.get(audience);
  if (cachedJwt) return `vapid t=${cachedJwt}, k=${bytesToBase64Url(vapid.publicRaw)}`;

  const header = bytesToBase64Url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const expiresAt = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const claims = bytesToBase64Url(utf8(JSON.stringify({ aud: audience, exp: expiresAt, sub: subject })));
  const signingInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    vapid.privateKey,
    utf8(signingInput)
  );
  const jwt = `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
  vapid.jwtCache.set(audience, jwt);
  return `vapid t=${jwt}, k=${bytesToBase64Url(vapid.publicRaw)}`;
}

// ---------------------------------------------------------------------------
// Payload encryption (RFC 8291, aes128gcm)
// ---------------------------------------------------------------------------

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, lengthBytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    lengthBytes * 8
  );
  return new Uint8Array(bits);
}

async function encryptPayload(
  userPublicKeyB64Url: string,
  userAuthB64Url: string,
  payloadText: string
): Promise<Uint8Array> {
  const uaPublic = base64UrlToBytes(userPublicKeyB64Url);
  const authSecret = base64UrlToBytes(userAuthB64Url);
  const plaintext = utf8(payloadText);

  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) throw new Error('Invalid subscriber public key');
  if (plaintext.length + 1 > 4096 - 17 - 65 - 21) throw new Error('Push payload too large');

  const serverKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits'
  ]);
  const serverPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));

  const uaCryptoKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaCryptoKey },
      serverKeys.privateKey,
      256
    )
  );

  const ikm = await hkdf(
    authSecret,
    sharedSecret,
    concat(utf8('WebPush: info'), new Uint8Array([0]), uaPublic, serverPublicRaw),
    32
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, concat(utf8('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikm, concat(utf8('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  // Record body: payload || 0x02 padding delimiter (RFC 8291 section 6).
  const record = concat(plaintext, new Uint8Array([2]));
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, cekKey, record)
  );

  const out = new Uint8Array(16 + 4 + 1 + serverPublicRaw.length + ciphertext.length);
  let offset = 0;
  out.set(salt, offset);
  offset += 16;
  const rs = 4096;
  out[offset++] = (rs >>> 24) & 0xff;
  out[offset++] = (rs >>> 16) & 0xff;
  out[offset++] = (rs >>> 8) & 0xff;
  out[offset++] = rs & 0xff;
  out[offset++] = serverPublicRaw.length;
  out.set(serverPublicRaw, offset);
  offset += serverPublicRaw.length;
  out.set(ciphertext, offset);
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PushSubscriptionLike {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendResult {
  ok: boolean;
  status: number;
  /** true when the push service reported this endpoint as gone/expired */
  expired: boolean;
  error?: string;
}

export interface WebPushOptions {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
  ttlSeconds?: number;
}

export async function sendWebPush(
  subscription: PushSubscriptionLike,
  payload: unknown,
  options: WebPushOptions
): Promise<SendResult> {
  try {
    const vapid = await loadVapid(options.vapidPublicKey, options.vapidPrivateKey);
    const audience = new URL(subscription.endpoint).origin;
    const authorization = await vapidAuthorizationHeader(vapid, audience, options.vapidSubject);
    const body = await encryptPayload(subscription.p256dh, subscription.auth, JSON.stringify(payload ?? {}));

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(options.ttlSeconds ?? 60 * 60),
        Urgency: 'high'
      },
      body
    });

    if (response.ok) return { ok: true, status: response.status, expired: false };
    const expired = response.status === 404 || response.status === 410;
    let error = `Push service responded ${response.status}`;
    try {
      const detail = await response.text();
      if (detail) error += `: ${detail.slice(0, 300)}`;
    } catch {
      // ignore body read failures
    }
    return { ok: false, status: response.status, expired, error };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      expired: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
