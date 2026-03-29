import process from "process";
import { isProduction } from "@/utils/environment";
/**
 * Returns the API base URL based on the current environment.
 * In production it retrieves the URL from NEXT_PUBLIC_PROD_API_URL (or falls back to a hardcoded url).
 * In development, it returns "http://localhost:8080".
 */
export function getApiDomain(): string {
  const prodUrl = process.env.NEXT_PUBLIC_PROD_API_URL ||
    "https://sopra-fs26-group-26-server.oa.r.appspot.com/"; // updated!
  const devUrl = "http://localhost:8080";
  return isProduction() ? prodUrl : devUrl;
}

export function getSockJsStompUrl(): string {
  const base = getApiDomain().replace(/\/+$/, "");
  const withProto = base.includes("://") ? base : `http://${base}`;
  return `${withProto}/ws`;
}
