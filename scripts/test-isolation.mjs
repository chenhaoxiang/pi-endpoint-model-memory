import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export const OWNER_MARKER = ".test-isolation-owner.json";
export const OWNER_KIND = "pi-endpoint-model-memory/test-isolation";
/** Presence of this key proves the test process started through scripts/test-isolated.mjs. */
export const ISOLATION_ENV_MARKER = "PI_ENDPOINT_MEMORY_TEST_FIXTURE";

const BASE_ENV_KEYS = ["PATH", "LANG", "LC_ALL", "LC_CTYPE"];
const WINDOWS_ENV_KEYS = ["SYSTEMROOT", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT"];

/** Only what Node/tsx need to run plus platform system keys; every other parent key is dropped. */
export function allowedParentEnvKeys(platform = process.platform) {
  return platform === "win32" ? [...BASE_ENV_KEYS, ...WINDOWS_ENV_KEYS] : [...BASE_ENV_KEYS];
}

function isolatedPaths(directory) {
  return {
    home: join(directory, "home"),
    agent: join(directory, "agent"),
    tmp: join(directory, "tmp"),
    xdgConfig: join(directory, "xdg-config"),
    xdgCache: join(directory, "xdg-cache"),
    xdgData: join(directory, "xdg-data"),
    xdgState: join(directory, "xdg-state"),
  };
}

/**
 * Owned, disposable fixture: private directories plus an owner marker that every
 * cleanup re-reads, so no path outside this fixture can ever be removed.
 */
export async function createIsolatedFixture(root, label) {
  const resolvedRoot = resolve(root);
  await mkdir(resolvedRoot, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(resolvedRoot, `${label}-`));
  const paths = isolatedPaths(directory);
  for (const path of Object.values(paths)) await mkdir(path, { recursive: true, mode: 0o700 });
  const markerPath = join(directory, OWNER_MARKER);
  const owner = { kind: OWNER_KIND, label, pid: process.pid, createdAt: new Date().toISOString() };
  await writeFile(markerPath, `${JSON.stringify(owner, null, 2)}\n`, { mode: 0o600 });
  return { root: resolvedRoot, label, directory, markerPath, paths };
}

export async function readFixtureOwner(directory) {
  try {
    const owner = JSON.parse(await readFile(join(directory, OWNER_MARKER), "utf8"));
    return owner && typeof owner === "object" ? owner : undefined;
  } catch {
    return undefined;
  }
}

async function fixtureOwnershipError(fixture) {
  if (!fixture || typeof fixture.directory !== "string" || typeof fixture.root !== "string") {
    return "fixture identity is incomplete";
  }
  const inRoot = resolve(fixture.directory).startsWith(`${resolve(fixture.root)}${sep}`);
  if (!inRoot) return "fixture is outside the isolation root";
  const owner = await readFixtureOwner(fixture.directory);
  if (owner?.kind !== OWNER_KIND || owner.label !== fixture.label) return "fixture owner marker is missing or foreign";
  return undefined;
}

export async function cleanupIsolatedFixture(fixture) {
  const error = await fixtureOwnershipError(fixture);
  if (error) throw new Error(`Refusing to clean an unowned fixture: ${error}`);
  await rm(fixture.directory, { recursive: true, force: true });
}

/**
 * The child environment: isolated config/state roots plus an allowlisted parent
 * subset. Credentials, Pi overrides, NODE_OPTIONS and npm_* never reach it.
 */
export function isolatedEnv(fixture, parentEnv = process.env, platform = process.platform) {
  const allowedKeys = allowedParentEnvKeys(platform);
  const env = {};
  for (const key of allowedKeys) {
    if (parentEnv[key] !== undefined) env[key] = parentEnv[key];
  }
  Object.assign(env, {
    HOME: fixture.paths.home,
    USERPROFILE: fixture.paths.home,
    PI_CODING_AGENT_DIR: fixture.paths.agent,
    XDG_CONFIG_HOME: fixture.paths.xdgConfig,
    XDG_CACHE_HOME: fixture.paths.xdgCache,
    XDG_DATA_HOME: fixture.paths.xdgData,
    XDG_STATE_HOME: fixture.paths.xdgState,
    TMPDIR: fixture.paths.tmp,
    TMP: fixture.paths.tmp,
    TEMP: fixture.paths.tmp,
    [ISOLATION_ENV_MARKER]: fixture.directory,
  });
  const droppedKeys = Object.keys(parentEnv).filter((key) => !(key in env));
  return { env, allowedKeys, droppedKeys };
}

/** Non-secret facts for logs and receipts: no home path, no credentials. */
export function isolationSummary(fixture, parentEnv = process.env) {
  const prefix = `${fixture.directory}${sep}`;
  const realHome = parentEnv.HOME;
  return {
    homeInsideFixture: fixture.paths.home.startsWith(prefix),
    homeIsRealHome: typeof realHome === "string" && realHome.length > 0 && resolve(realHome) === resolve(fixture.paths.home),
    adcInsideFixture: join(fixture.paths.home, ".config/gcloud/application_default_credentials.json").startsWith(prefix),
    fixture: relative(process.cwd(), fixture.directory),
  };
}

/**
 * A failing test run keeps its own exit code; a failed fixture cleanup can never
 * turn an otherwise green run into a false pass.
 */
export function combinedExitCode({ childExitCode, cleanupFailed }) {
  return childExitCode !== 0 ? childExitCode : cleanupFailed ? 1 : 0;
}
