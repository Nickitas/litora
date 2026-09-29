import { isIP } from "node:net";
import type { NestExpressApplication } from "@nestjs/platform-express";

/** parseTrustedProxies разрешает только явно заданные адреса proxy и CIDR. */
export function parseTrustedProxies(value = ""): string[] {
  if (!value.trim()) return [];
  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.length > 32 || entries.some((entry) => {
    const parts = entry.split("/");
    const version = isIP(parts[0]);
    if (!version || parts.length > 2) return true;
    if (parts.length === 1) return false;
    if (!/^\d+$/.test(parts[1])) return true;
    const prefix = Number(parts[1]);
    return prefix < 1 || prefix > (version === 4 ? 32 : 128);
  })) {
    throw new Error("TRUSTED_PROXY_CIDRS: укажите IP/CIDR через запятую, без wildcard, true или числа hops");
  }
  return entries;
}

/** configureTrustedProxies запрещает доверие заголовкам вне заданной сети proxy. */
export function configureTrustedProxies(
  app: NestExpressApplication,
  proxies: string[],
): void {
  app.set("trust proxy", proxies.length ? proxies : false);
}
