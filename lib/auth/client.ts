"use client";

let csrfToken = "";
const REQUEST_TIMEOUT_MS = 15_000;

async function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) forwardAbort();
  else init.signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error("The server took too long to respond. Wait a moment and try again.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", forwardAbort);
  }
}

async function loadCsrfToken(force = false): Promise<string> {
  if (csrfToken && !force) return csrfToken;
  const response = await timedFetch("/api/auth/csrf", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("The security token could not be created. Refresh the page and try again.");
  const body = await response.json() as { csrfToken?: string };
  if (!body.csrfToken) throw new Error("The security token response was incomplete. Refresh the page and try again.");
  csrfToken = body.csrfToken;
  return csrfToken;
}

export async function secureFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const body = init.body;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await loadCsrfToken(attempt === 1);
    const response = await timedFetch(url, {
      ...init,
      body,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        ...init.headers,
        "x-csrf-token": token
      }
    });
    if (response.status !== 403 || attempt === 1) return response;
    csrfToken = "";
  }
  throw new Error("The request could not be completed.");
}

export async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}
