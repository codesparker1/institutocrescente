/**
 * Authenticates against the running app's NextAuth credentials flow and
 * returns a Cookie header string usable for subsequent authenticated requests.
 */

function parseSetCookies(headers) {
  const raw = headers.getSetCookie ? headers.getSetCookie() : [];
  return raw.map((c) => c.split(";")[0]);
}

export async function loginAndGetCookie(baseUrl, email, password) {
  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`);
  const csrfCookies = parseSetCookies(csrfRes.headers);
  const { csrfToken } = await csrfRes.json();

  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    redirect: "false",
    json: "true",
  });

  const loginRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookies.join("; "),
    },
    body: body.toString(),
    redirect: "manual",
  });

  const loginCookies = parseSetCookies(loginRes.headers);
  const allCookies = [...csrfCookies, ...loginCookies];

  const hasSessionToken = allCookies.some((c) => c.includes("session-token"));
  if (!hasSessionToken) {
    throw new Error(
      `Login falhou para ${email} (status ${loginRes.status}). Verifica se o servidor está a correr e se a password de demo está correta.`,
    );
  }

  return allCookies.join("; ");
}
