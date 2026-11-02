/** Parses a `Cookie` request header. The first occurrence of a name wins. */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name && !(name in out)) out[name] = value;
  }
  return out;
}

/**
 * Serialises a `Set-Cookie` value. Always adds `Secure; SameSite=Lax`.
 * HttpOnly is on unless `httpOnly: false` is passed explicitly.
 */
export function serializeCookie(
  name: string,
  value: string,
  opts: { maxAge: number; path: string; httpOnly?: boolean },
): string {
  const parts = [`${name}=${value}`, `Max-Age=${opts.maxAge}`, `Path=${opts.path}`];
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  parts.push("Secure", "SameSite=Lax");
  return parts.join("; ");
}
