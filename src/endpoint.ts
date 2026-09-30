import { createHash } from "node:crypto";

export interface EndpointModel {
  provider: string;
  id: string;
  api: string;
  baseUrl: string;
}

export interface Endpoint {
  key: string;
  provider: string;
}

export function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

/** No auth/command evaluation. Only the configured composed catalog URL is used. */
export function endpointFor(model: EndpointModel): Endpoint | undefined {
  if (!validIdentifier(model.provider) || !validIdentifier(model.id) ||
      !validIdentifier(model.api) || typeof model.baseUrl !== "string" ||
      model.baseUrl.length > 8192 || /[\u0000-\u0020\u007f]|\$\{|\$[A-Za-z_]/u.test(model.baseUrl)) {
    return undefined;
  }
  try {
    const url = new URL(model.baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (url.username || url.password) return undefined;
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    const canonical = JSON.stringify(["endpoint-model-memory/v1", model.provider, model.api, url.href]);
    return { key: createHash("sha256").update(canonical).digest("hex"), provider: model.provider };
  } catch {
    return undefined;
  }
}
