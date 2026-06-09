// Protection SSRF : valide qu'une URL est sûre à récupérer côté serveur.
// Refuse tout ce qui n'est pas HTTPS public (localhost, loopback, métadonnées
// cloud, plages d'IP privées RFC 1918 et link-local).
export function isUrlSafe(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") return false;

    // Les hôtes IPv6 sont sérialisés entre crochets (ex. "[::1]") par l'API URL.
    // On retire les crochets pour comparer la valeur réelle.
    const hostname = url.hostname.toLowerCase();
    const bareHost = hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

    if (bareHost === "localhost" || bareHost === "127.0.0.1") return false;
    // Loopback IPv6 (forme compacte et forme étendue).
    if (bareHost === "::1" || bareHost === "0:0:0:0:0:0:0:1") return false;
    // Endpoint de métadonnées cloud (vecteur SSRF classique).
    if (bareHost === "169.254.169.254") return false;

    const parts = bareHost.split(".");
    if (parts.length === 4) {
      const firstOctet = parseInt(parts[0], 10);
      const secondOctet = parseInt(parts[1], 10);
      if (firstOctet === 10) return false;
      if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) return false;
      if (firstOctet === 192 && secondOctet === 168) return false;
      if (firstOctet === 169 && secondOctet === 254) return false;
    }

    return true;
  } catch {
    return false;
  }
}
