import { getCloudflareContext } from "@opennextjs/cloudflare";

export type YouTubeEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  YOUTUBE_TOKEN_ENCRYPTION_KEY?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  NEWEIX_SITE_URL?: string;
};

export async function getYouTubeEnv(): Promise<YouTubeEnv> {
  const context = await getCloudflareContext();
  const env = context.env as Record<string, unknown>;
  return {
    GOOGLE_CLIENT_ID: String(env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ""),
    GOOGLE_CLIENT_SECRET: String(env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || ""),
    YOUTUBE_TOKEN_ENCRYPTION_KEY: String(env.YOUTUBE_TOKEN_ENCRYPTION_KEY || process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY || ""),
    NEXT_PUBLIC_SITE_URL: String(env.NEXT_PUBLIC_SITE_URL || env.NEWEIX_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEWEIX_SITE_URL || "https://neweix.com"),
  };
}

export function youtubeRedirectUri(siteUrl: string): string {
  return new URL("/api/admin/social-media/youtube/callback", siteUrl).toString();
}

function encryptionKeyBytes(encoded: string): Uint8Array {
  let binary: string;
  try { binary = atob(encoded); } catch { throw new Error("YOUTUBE_TOKEN_ENCRYPTION_KEY must be base64 encoded."); }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (bytes.byteLength !== 32) throw new Error("YOUTUBE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return bytes;
}

/**
 * Copy bytes into a standalone ArrayBuffer. This avoids passing a
 * Uint8Array<ArrayBufferLike> (which may be backed by SharedArrayBuffer)
 * to Web Crypto APIs that require an ArrayBuffer-backed BufferSource.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

export async function encryptYouTubeToken(value: string, encodedKey: string): Promise<string> {
  const keyBytes = encryptionKeyBytes(encodedKey);
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(value);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptYouTubeToken(value: string, encodedKey: string): Promise<string> {
  const [version, ivPart, ciphertextPart] = value.split(".");
  if (version !== "v1" || !ivPart || !ciphertextPart) throw new Error("Unsupported encrypted YouTube token format.");
  const keyBytes = encryptionKeyBytes(encodedKey);
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), "AES-GCM", false, ["decrypt"]);
  const decode = (part: string) => Uint8Array.from(atob(part), (char) => char.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(decode(ivPart)) },
    key,
    toArrayBuffer(decode(ciphertextPart)),
  );
  return new TextDecoder().decode(plaintext);
}
