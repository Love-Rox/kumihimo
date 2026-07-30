/**
 * Putting a diagram in a URL.
 *
 * The source travels in the fragment, which never reaches a server. That keeps sharing
 * free of any backend, and keeps a wiring plan — which is often commercially sensitive —
 * out of anyone's access logs.
 */

/** Fragment key the source is stored under. */
const KEY = 'src';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  if (typeof CompressionStream === 'undefined') return undefined;
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  if (typeof DecompressionStream === 'undefined') return undefined;
  try {
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return undefined;
  }
}

/**
 * Encode source into a URL fragment value.
 *
 * Compressed where the platform allows it, because a rack of any size produces a source
 * long enough to hit a URL length limit uncompressed. The prefix records which it is, so
 * a link made in one browser opens in another.
 *
 * @param source - The `.khm` text to encode.
 * @returns A fragment value safe to place after `#`.
 */
export async function encodeSource(source: string): Promise<string> {
  const bytes = new TextEncoder().encode(source);
  const compressed = await deflate(bytes);
  return compressed ? `z${toBase64Url(compressed)}` : `p${toBase64Url(bytes)}`;
}

/**
 * Decode source from a URL fragment value.
 *
 * @param encoded - The value produced by {@link encodeSource}.
 * @returns The source, or `undefined` when the value cannot be read.
 */
export async function decodeSource(encoded: string): Promise<string | undefined> {
  if (encoded.length < 2) return undefined;
  const kind = encoded[0];
  const body = encoded.slice(1);

  try {
    const bytes = fromBase64Url(body);
    if (kind === 'p') return new TextDecoder().decode(bytes);
    if (kind === 'z') {
      const plain = await inflate(bytes);
      return plain === undefined ? undefined : new TextDecoder().decode(plain);
    }
  } catch {
    // A hand-edited or truncated link is not an error worth throwing over; the editor
    // simply falls back to its initial source.
  }
  return undefined;
}

/**
 * Build a shareable URL for a diagram.
 *
 * @param source - The `.khm` text to share.
 * @param base - URL to hang the fragment on. Defaults to the current location.
 * @returns The full URL.
 */
export async function buildShareUrl(source: string, base?: string): Promise<string> {
  const url = new URL(base ?? globalThis.location?.href ?? 'https://example.com/');
  url.hash = `${KEY}=${await encodeSource(source)}`;
  return url.toString();
}

/**
 * Read a shared diagram out of a URL.
 *
 * @param href - URL to read. Defaults to the current location.
 * @returns The source, or `undefined` when the URL carries none.
 */
export async function readSharedSource(href?: string): Promise<string | undefined> {
  const hash = href
    ? new URL(href).hash
    : typeof globalThis.location === 'undefined'
      ? ''
      : globalThis.location.hash;
  const value = new URLSearchParams(hash.replace(/^#/, '')).get(KEY);
  return value ? decodeSource(value) : undefined;
}
