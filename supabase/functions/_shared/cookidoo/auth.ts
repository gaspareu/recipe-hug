/**
 * Authentification Cookidoo — nouveau flux PKCE/cookie (depuis mai 2026).
 *
 * Remplace l'ancien OAuth2 password grant (désactivé par Vorwerk le 22/05/2026).
 * Reproduit le flow navigateur en trois étapes :
 *   1. GET cookidoo.fr/profile/{lang}/login → chaîne de redirects → page CIAM
 *   2. Extract requestId du HTML
 *   3. POST credentials sur ciam.prod.cookidoo.vorwerk-digital.com → cookies de session
 *
 * L'auth repose entièrement sur les cookies `_oauth2_proxy` + `v-authenticated`,
 * aucun Bearer token n'est utilisé.
 */

const CIAM_LOGIN_URL = "https://ciam.prod.cookidoo.vorwerk-digital.com/login-srv/login";
const REQUIRED_COOKIES = ["_oauth2_proxy", "v-authenticated"];

// Mapping pays → locale Cookidoo
const COUNTRY_TO_LANG: Record<string, string> = {
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  es: "es-ES",
  pt: "pt-PT",
  nl: "nl-NL",
  gb: "en-GB",
  au: "en-AU",
  at: "de-AT",
  be: "fr-BE",
  ch: "de-CH",
};

export function countryToLang(country: string): string {
  return COUNTRY_TO_LANG[country.toLowerCase()] ?? `${country}-${country.toUpperCase()}`;
}

// ── Cookie jar avec gestion de domaine ──────────────────────────────────────

interface Cookie {
  domain: string;
  name: string;
  value: string;
}

export class CookieJar {
  private cookies: Cookie[] = [];

  addFromResponse(requestUrl: string, headers: Headers): void {
    const requestHostname = new URL(requestUrl).hostname;
    const setCookies: string[] = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const raw of setCookies) {
      const parts = raw.split(";");
      const [nameRaw, ...valueRest] = (parts[0] ?? "").split("=");
      const name = nameRaw.trim();
      const value = valueRest.join("=").trim();
      if (!name) continue;
      const domainAttr = parts.find((p) => p.trim().toLowerCase().startsWith("domain="));
      const domain = domainAttr
        ? domainAttr.split("=")[1]?.trim().replace(/^\./, "") ?? requestHostname
        : requestHostname;
      const idx = this.cookies.findIndex((c) => c.name === name && c.domain === domain);
      if (idx >= 0) {
        this.cookies[idx] = { domain, name, value };
      } else {
        this.cookies.push({ domain, name, value });
      }
    }
  }

  headerForUrl(url: string): string {
    const hostname = new URL(url).hostname;
    return this.cookies
      .filter((c) => hostname === c.domain || hostname.endsWith(`.${c.domain}`))
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }

  has(name: string): boolean {
    return this.cookies.some((c) => c.name === name);
  }

  /** Sérialise les cookies (pour persistance optionnelle). */
  serialize(): string {
    return JSON.stringify(this.cookies);
  }

  static deserialize(s: string): CookieJar {
    const jar = new CookieJar();
    jar.cookies = JSON.parse(s) as Cookie[];
    return jar;
  }
}

// ── Suivi manuel des redirects avec accumulation de cookies ─────────────────

async function followRedirects(
  url: string,
  jar: CookieJar,
  init: RequestInit = {},
  maxRedirects = 15,
): Promise<Response> {
  let current = url;
  let options = { ...init };
  let count = 0;

  while (count < maxRedirects) {
    const cookieHeader = jar.headerForUrl(current);
    const res = await fetch(current, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      redirect: "manual",
    });

    jar.addFromResponse(current, res.headers);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Redirect sans Location header (HTTP ${res.status})`);
      current = loc.startsWith("http") ? loc : new URL(loc, current).toString();
      // Les redirects après POST se font en GET
      options = { headers: options.headers };
      count++;
    } else {
      return res;
    }
  }
  throw new Error(`Trop de redirects (>${maxRedirects})`);
}

// ── Extraction du requestId dans le HTML CIAM ────────────────────────────────

function extractRequestId(html: string): string {
  const m =
    html.match(/<input[^>]*name=["']requestId["'][^>]*value=["']([^"']+)["']/i) ??
    html.match(/<input[^>]*value=["']([0-9a-f-]{36})["'][^>]*name=["']requestId["']/i);
  if (!m) {
    throw new Error(
      "requestId introuvable dans la page CIAM. Le HTML de la page de login a peut-être changé.",
    );
  }
  return m[1];
}

// ── API publique ─────────────────────────────────────────────────────────────

/**
 * Authentifie un utilisateur Cookidoo.
 * @param email   Email du compte Cookidoo
 * @param password Mot de passe
 * @param lang   Locale (ex. "fr-FR")
 * @returns CookieJar prêt à être utilisé pour les appels API
 */
export async function login(email: string, password: string, lang: string): Promise<CookieJar> {
  const jar = new CookieJar();
  const loginUrl = `https://cookidoo.fr/profile/${lang}/login?redirectAfterLogin=${encodeURIComponent(`/foundation/${lang}/for-you`)}`;

  // Étape 1 : GET → chaîne de redirects → page HTML CIAM
  const loginPageRes = await followRedirects(loginUrl, jar);
  if (!loginPageRes.ok) {
    throw new Error(`Page de login inaccessible (HTTP ${loginPageRes.status})`);
  }
  const html = await loginPageRes.text();

  // Étape 2 : extraction du requestId
  const requestId = extractRequestId(html);

  // Étape 3 : POST credentials → redirects → cookies de session
  await followRedirects(CIAM_LOGIN_URL, jar, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ requestId, username: email, password }).toString(),
  });

  // Étape 4 : vérification
  const missing = REQUIRED_COOKIES.filter((n) => !jar.has(n));
  if (missing.length > 0) {
    throw new Error(
      `Auth échouée — cookies manquants : ${missing.join(", ")}. ` +
        "Vérifiez votre email/mot de passe Cookidoo.",
    );
  }

  return jar;
}
