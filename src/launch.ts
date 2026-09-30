import { basename } from "node:path";
import { parseArgs } from "@earendil-works/pi-coding-agent";

export interface LaunchPolicy {
  cliHost: boolean;
  explicitSelection: boolean;
  sessionSelection: boolean;
  explicitThinking: boolean;
  ephemeral: boolean;
}

/** Reuse Pi's public parser, including flag values and the '--' prompt delimiter. */
export function launchPolicy(argv: readonly string[]): LaunchPolicy {
  const entry = basename(argv[1] ?? "");
  const parsed = parseArgs(argv.slice(2));
  return {
    cliHost: /^(?:pi(?:\.exe)?|cli\.(?:js|mjs|cjs|ts))$/u.test(entry),
    explicitSelection: parsed.model !== undefined || parsed.models !== undefined || parsed.apiKey !== undefined ||
      parsed.diagnostics.length > 0 || [...parsed.unknownFlags.keys()].some((flag) => flag !== "endpoint-model-memory"),
    sessionSelection: Boolean(parsed.continue || parsed.resume || parsed.session || parsed.sessionId || parsed.fork),
    explicitThinking: parsed.thinking !== undefined,
    ephemeral: Boolean(parsed.noSession),
  };
}
