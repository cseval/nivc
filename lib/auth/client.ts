"use client";

let csrfToken = "";

async function loadCsrfToken(force = false): Promise<string> {
  if (csrfToken && !force) return csrfToken;
  const response = await fetch("/api/auth/csrf", { cache: "no-store", credentials: "same-origin" });
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
    const response = await fetch(url, {
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
