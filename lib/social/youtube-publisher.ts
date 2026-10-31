export type YouTubePublisherEnv = {
  clientId: string;
  clientSecret: string;
  encryptionKey: string;
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("YouTube token encryption key is not valid base64.");
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function importEncryptionKey(encoded: string, usage: KeyUsage[]) {
  const bytes = decodeBase64(encoded);
  if (bytes.byteLength !== 32) {
    throw new Error("YouTube token encryption key must decode to 32 bytes.");
  }
  return crypto.subtle.importKey("raw", toArrayBuffer(bytes), "AES-GCM", false, usage);
}

export async function decryptYouTubeSecret(value: string, encodedKey: string): Promise<string> {
  const [version, ivPart, ciphertextPart] = value.split(".");
  if (version !== "v1" || !ivPart || !ciphertextPart) {
    throw new Error("Unsupported YouTube token ciphertext.");
  }
  const key = await importEncryptionKey(encodedKey, ["decrypt"]);
  const iv = decodeBase64(ivPart);
  const ciphertext = decodeBase64(ciphertextPart);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export async function encryptYouTubeSecret(value: string, encodedKey: string): Promise<string> {
  const key = await importEncryptionKey(encodedKey, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(value);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext),
  );
  return `v1.${encodeBase64(iv)}.${encodeBase64(new Uint8Array(ciphertext))}`;
}

export async function refreshYouTubeAccessToken(
  refreshTokenCiphertext: string,
  env: YouTubePublisherEnv,
): Promise<{ accessToken: string; accessTokenCiphertext: string; expiresAt: string }> {
  const refreshToken = await decryptYouTubeSecret(refreshTokenCiphertext, env.encryptionKey);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || `Google token refresh failed (${response.status}).`);
  }
  return {
    accessToken: payload.access_token,
    accessTokenCiphertext: await encryptYouTubeSecret(payload.access_token, env.encryptionKey),
    expiresAt: new Date(Date.now() + (payload.expires_in ?? 3600) * 1000).toISOString(),
  };
}

function isSafeHttpsMediaUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password ||
      host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") ||
      /^(127\\.|10\\.|192\\.168\\.|169\\.254\\.)/.test(host) ||
      /^172\\.(1[6-9]|2[0-9]|3[01])\\./.test(host) ||
      host === "::1" || host === "[::1]") {
    throw new Error("Video URL must be a public HTTPS URL.");
  }
  return url;
}

export async function uploadYouTubeVideo(input: {
  accessToken: string;
  videoUrl: string;
  title: string;
  description: string;
}): Promise<{ videoId: string; videoUrl: string }> {
  const mediaUrl = isSafeHttpsMediaUrl(input.videoUrl);
  const mediaResponse = await fetch(mediaUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!mediaResponse.ok) throw new Error(`Video download failed (${mediaResponse.status}).`);
  const contentType = mediaResponse.headers.get("content-type")?.split(";")[0].trim() || "";
  if (!contentType.startsWith("video/")) throw new Error("The media URL must return a video file.");
  const declaredSize = Number(mediaResponse.headers.get("content-length") || "0");
  if (declaredSize > 50 * 1024 * 1024) throw new Error("Video file exceeds the 50 MB scheduled-upload limit.");
  const videoBytes = await mediaResponse.arrayBuffer();
  if (videoBytes.byteLength === 0 || videoBytes.byteLength > 50 * 1024 * 1024) {
    throw new Error("Video file is empty or exceeds the 50 MB scheduled-upload limit.");
  }

  const initResponse = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType,
        "X-Upload-Content-Length": String(videoBytes.byteLength),
      },
      body: JSON.stringify({
        snippet: {
          title: input.title.slice(0, 100),
          description: input.description.slice(0, 5000),
          categoryId: "22",
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
        },
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!initResponse.ok) {
    const details = (await initResponse.text()).slice(0, 500);
    throw new Error(`YouTube upload initialization failed (${initResponse.status}): ${details}`);
  }
  const uploadLocation = initResponse.headers.get("location");
  if (!uploadLocation) throw new Error("YouTube did not return a resumable upload URL.");
  const uploadUrl = new URL(uploadLocation);
  if (uploadUrl.protocol !== "https:" || uploadUrl.hostname !== "www.googleapis.com") {
    throw new Error("YouTube returned an unexpected upload destination.");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": contentType,
      "Content-Length": String(videoBytes.byteLength),
    },
    body: videoBytes,
    signal: AbortSignal.timeout(90_000),
  });
  const uploaded = await uploadResponse.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!uploadResponse.ok || !uploaded?.id) {
    throw new Error(uploaded?.error?.message || `YouTube video upload failed (${uploadResponse.status}).`);
  }
  return {
    videoId: uploaded.id,
    videoUrl: `https://www.youtube.com/watch?v=${uploaded.id}`,
  };
}
