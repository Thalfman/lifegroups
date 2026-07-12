// Shared defenses for the unauthenticated, proxy-exempt telemetry sinks.
// These checks deliberately fail closed: browser reporters always send the
// Fetch Metadata and Content-Length headers, while accepting headerless
// clients would reopen the endpoints to trivial cross-site log injection.

export function isSameOriginTelemetryRequest(request: Request): boolean {
  return request.headers.get("sec-fetch-site") === "same-origin";
}

export function hasValidDeclaredBodyLength(
  request: Request,
  maxBytes: number
): boolean {
  const value = request.headers.get("content-length");
  if (!value || !/^\d+$/.test(value)) return false;

  const bytes = Number(value);
  return Number.isSafeInteger(bytes) && bytes > 0 && bytes <= maxBytes;
}

// Stream at most maxBytes into memory. Content-Length is only a hint and can
// be forged, so callers must use this even after the declared-length guard.
export async function readBoundedRequestText(
  request: Request,
  maxBytes: number
): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
