import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cleanupIsolatedFixture, combinedExitCode, createIsolatedFixture, isolatedEnv, isolationSummary,
} from "./test-isolation.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureLabel = "default";

async function testFiles() {
  const names = (await readdir(join(repoRoot, "test"))).filter((name) => name.endsWith(".test.ts")).sort();
  if (names.length === 0) throw new Error("No test/*.test.ts files found");
  return names.map((name) => join("test", name));
}

/** Installed SDK identity is recorded by version only; no credential or path data. */
async function sdkIdentities() {
  const identities = {};
  const scoped = join(repoRoot, "node_modules", "@earendil-works");
  for (const name of (await readdir(scoped)).sort()) {
    try {
      identities[`@earendil-works/${name}`] = JSON.parse(await readFile(join(scoped, name, "package.json"), "utf8")).version;
    } catch {
      // An unrelated scoped package without a readable manifest does not change the SDK set.
    }
  }
  try {
    identities["brace-expansion"] = JSON.parse(await readFile(join(repoRoot, "node_modules", "brace-expansion", "package.json"), "utf8")).version;
  } catch {
    // Optional: only recorded when present.
  }
  return identities;
}

function run(args, env) {
  return new Promise((resolveExit) => {
    const child = spawn(process.execPath, args, { cwd: repoRoot, env, stdio: "inherit" });
    const forward = (signal) => child.kill(signal);
    process.once("SIGINT", forward);
    process.once("SIGTERM", forward);
    child.once("close", (code, signal) => {
      process.removeListener("SIGINT", forward);
      process.removeListener("SIGTERM", forward);
      resolveExit({ code: code ?? 1, signal });
    });
  });
}

const fixture = await createIsolatedFixture(join(repoRoot, "tmp", "test-isolation"), fixtureLabel);
const { env, allowedKeys } = isolatedEnv(fixture, process.env);
const summary = isolationSummary(fixture, process.env);
const args = ["--import", "tsx", "--test", ...(await testFiles())];
const sdk = await sdkIdentities();

// Fixed labels and env key names only: no secret values, no real home path.
console.log(`[test-isolation] label=${fixtureLabel} fixture=${summary.fixture} env-keys=${allowedKeys.join(",")} home-is-real-home=${summary.homeIsRealHome} home-inside-fixture=${summary.homeInsideFixture} adc-inside-fixture=${summary.adcInsideFixture}`);

let result = { code: 1, signal: null };
let cleanupError;
try {
  result = await run(args, env);
} finally {
  try {
    await cleanupIsolatedFixture(fixture);
  } catch (error) {
    cleanupError = error instanceof Error ? error.message : String(error);
  }
}

const exitCode = combinedExitCode({ childExitCode: result.code, cleanupFailed: cleanupError !== undefined });
const receipt = {
  label: fixtureLabel,
  command: [process.execPath, ...args],
  node: process.version,
  platform: process.platform,
  envKeys: Object.keys(env).sort(),
  allowedParentEnvKeys: allowedKeys,
  fixture: summary.fixture,
  fixtureCleaned: cleanupError === undefined,
  ...(cleanupError === undefined ? {} : { cleanupError }),
  homeIsRealHome: summary.homeIsRealHome,
  homeInsideFixture: summary.homeInsideFixture,
  adcInsideFixture: summary.adcInsideFixture,
  sdk,
  childExitCode: result.code,
  exitCode,
  signal: result.signal,
};
await mkdir(join(repoRoot, "tmp", "verification"), { recursive: true });
await writeFile(join(repoRoot, "tmp", "verification", "test-isolation-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(`[test-isolation] exit=${exitCode} child-exit=${result.code} fixture-cleaned=${receipt.fixtureCleaned} receipt=tmp/verification/test-isolation-receipt.json`);

process.exitCode = exitCode;
