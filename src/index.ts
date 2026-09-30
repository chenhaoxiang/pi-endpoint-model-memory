import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerModelMemory } from "./controller.js";
import { launchPolicy } from "./launch.js";
import { FileMemoryStore } from "./store.js";

export default function endpointModelMemory(pi: ExtensionAPI): void {
  registerModelMemory(pi, {
    store: new FileMemoryStore(join(getAgentDir(), "endpoint-model-memory")),
    launch: launchPolicy(process.argv),
  });
}
