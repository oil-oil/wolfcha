import type { IncomingHttpHeaders } from "node:http";
import * as https from "node:https";
import { URL } from "node:url";
import * as zlib from "node:zlib";

/** 服务端 HTTPS 请求，返回解压后的 body（旧 /api/tts 路由的同款实现）。 */
export async function requestBuffer(
  inputUrl: string,
  init: {
    method: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
    timeoutMs: number;
  },
): Promise<{ statusCode: number; headers: IncomingHttpHeaders; body: Buffer }> {
  const u = new URL(inputUrl);
  if (u.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${u.protocol}`);
  }

  return await new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port ? Number(u.port) : 443,
        path: `${u.pathname}${u.search}`,
        method: init.method,
        headers: init.headers,
        family: 4,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);

          const enc = res.headers["content-encoding"];
          const encStr = Array.isArray(enc) ? enc.join(",") : enc;

          let body = raw;
          try {
            if (typeof encStr === "string" && encStr) {
              const e = encStr.toLowerCase();
              if (e.includes("br")) body = zlib.brotliDecompressSync(raw);
              else if (e.includes("gzip")) body = zlib.gunzipSync(raw);
              else if (e.includes("deflate")) body = zlib.inflateSync(raw);
            }
          } catch (decompressErr) {
            // 解压失败就回退到原始内容，并在上层用可读错误定位
            console.error("TTS response decompress failed:", decompressErr);
            body = raw;
          }

          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body,
          });
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(init.timeoutMs, () => {
      req.destroy(new Error("RequestTimeout"));
    });

    if (init.body) req.write(init.body);
    req.end();
  });
}

export function bufferToArrayBuffer(b: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(b.byteLength);
  new Uint8Array(ab).set(b);
  return ab;
}

/** 通过魔数识别音频容器类型；识别不出时返回 null。 */
export function sniffAudioMime(b: Buffer): { mime: string | null; reason?: string } {
  if (!b || b.length < 4) return { mime: null, reason: "empty_or_too_short" };

  // WAV: RIFF....WAVE
  if (b.length >= 12 && b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WAVE") {
    return { mime: "audio/wav" };
  }

  // OGG
  if (b.slice(0, 4).toString("ascii") === "OggS") {
    return { mime: "audio/ogg" };
  }

  // MP3: ID3 tag or frame sync 0xFFE?
  if (b.slice(0, 3).toString("ascii") === "ID3") {
    return { mime: "audio/mpeg" };
  }
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) {
    return { mime: "audio/mpeg" };
  }

  // If it looks like text/json, treat as non-audio
  const head = b.slice(0, 64).toString("utf8").trim();
  if (head.startsWith("{") || head.startsWith("[") || head.toLowerCase().includes("error")) {
    return { mime: null, reason: "looks_like_text_or_json" };
  }

  return { mime: null, reason: "unknown_format" };
}

/** 优先信任响应头 Content-Type，其次魔数嗅探。 */
export function resolveAudioMime(buffer: Buffer, contentType: unknown): string | null {
  if (typeof contentType === "string") {
    const ct = contentType.split(";")[0].trim().toLowerCase();
    if (ct === "audio/mpeg" || ct === "audio/mp3" || ct === "audio/wav" || ct === "audio/ogg" || ct === "audio/aac" || ct === "audio/opus") {
      return ct === "audio/mp3" ? "audio/mpeg" : ct;
    }
    if (ct === "application/json" || ct.startsWith("text/")) {
      return null;
    }
  }
  return sniffAudioMime(buffer).mime;
}
