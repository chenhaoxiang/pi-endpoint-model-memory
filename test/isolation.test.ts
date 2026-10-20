import assert from "node:assert/strict";
import { readFile, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import {
  ISOLATION_ENV_MARKER, OWNER_KIND, allowedParentEnvKeys, cleanupIsolatedFixture,
  createIsolatedFixture, isolatedEnv, isolationSummary, readFixtureOwner,
} from "../scripts/test-isolation.mjs";
import { cleanup, fixture } from "./fixtures.js";

const repoRoot = resolve(".");
const isolatedKeys = [
  "HOME", "USERPROFILE", "PI_CODING_AGENT_DIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME",
  "XDG_DATA_HOME", "XDG_STATE_HOME", "TMPDIR", "TMP", "TEMP", ISOLATION_ENV_MARKER,
];

test("npm test and npm run check route through the isolation wrapper", async () => {
  const scripts = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")).scripts;
  assert.match(scripts.test, /node scripts\/test-isolated\.mjs/u);
  assert.match(scripts.check, /npm test/u);
});

test("the running test process really is the isolated child", async () => {
  const directory = process.env[ISOLATION_ENV_MARKER];
  assert.ok(directory, `run the suite through 'npm test' (scripts/test-isolated.mjs); ${ISOLATION_ENV_MARKER} is unset`);
  const prefix = `${directory}${sep}`;
  // Every tool and Pi directory resolves inside the owned fixture, not the real machine.
  for (const key of isolatedKeys.filter((item) => item !== ISOLATION_ENV_MARKER)) {
    assert.ok(process.env[key]?.startsWith(prefix), `${key} is not inside the fixture`);
  }
  assert.ok(homedir().startsWith(prefix), "os.homedir() escapes the fixture");
  // An inherited parent environment would expose keys the wrapper never forwards.
  // NODE_TEST_* and __CF_USER_TEXT_ENCODING are injected after spawn by the test
  // runner and the platform, not inherited from the parent.
  const runtimeKeys = new Set(["NODE_TEST_CONTEXT", "NODE_TEST_WORKER_ID", "__CF_USER_TEXT_ENCODING"]);
  const expected = new Set([...allowedParentEnvKeys(), ...isolatedKeys, ...runtimeKeys]);
  const inherited = Object.keys(process.env).filter((key) => !expected.has(key));
  assert.deepEqual(inherited, []);
  // Google ADC discovery resolves inside the fixture, so a real ADC file cannot be reached.
  const adc = join(homedir(), ".config", "gcloud", "application_default_credentials.json");
  assert.ok(adc.startsWith(prefix));
  // The cleanup target exists during the run and carries our ownership marker.
  assert.equal((await readFixtureOwner(directory))?.kind, OWNER_KIND);
});

test("inherited credentials, Pi overrides and loader options are dropped", async () => {
  const root = await fixture("isolation-env");
  try {
    const owned = await createIsolatedFixture(join(root, "owned"), "env");
    const parent = {
      PATH: "/usr/local/bin:/usr/bin:/bin",
      LANG: "en_US.UTF-8",
      HOME: "/home/someone-else",
      PI_CODING_AGENT_DIR: "/home/someone-else/.pi/agent",
      OPENAI_API_KEY: "sk-planted",
      ANTHROPIC_API_KEY: "sk-ant-planted",
      GOOGLE_APPLICATION_CREDENTIALS: "/home/someone-else/.config/gcloud/application_default_credentials.json",
      AWS_SECRET_ACCESS_KEY: "planted",
      NODE_OPTIONS: "--require ./planted.js",
      npm_config_registry: "http://planted.invalid/",
    };
    const { env, allowedKeys, droppedKeys } = isolatedEnv(owned, parent);
    assert.equal(env.PATH, parent.PATH);
    assert.equal(env.LANG, parent.LANG);
    for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "AWS_SECRET_ACCESS_KEY", "NODE_OPTIONS", "npm_config_registry"]) {
      assert.equal(env[key], undefined, `${key} leaked into the child environment`);
      assert.ok(droppedKeys.includes(key));
    }
    assert.notEqual(env.HOME, parent.HOME);
    assert.notEqual(env.PI_CODING_AGENT_DIR, parent.PI_CODING_AGENT_DIR);
    for (const key of ["HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "TMPDIR"]) {
      assert.ok(env[key]?.startsWith(`${owned.directory}${sep}`), `${key} is not isolated`);
    }
    assert.deepEqual(Object.keys(env).filter((key) => !allowedKeys.includes(key)), isolatedKeys);
    assert.equal(isolationSummary(owned, parent).homeIsRealHome, false);
    assert.equal(isolationSummary(owned, { HOME: owned.paths.home }).homeIsRealHome, true);
    await cleanupIsolatedFixture(owned);
  } finally {
    await cleanup(root);
  }
});

test("owned fixtures are private, marked, and removed only when owned", async () => {
  const root = await fixture("isolation-ownership");
  try {
    const isolationRoot = join(root, "isolation");
    const owned = await createIsolatedFixture(isolationRoot, "ownership");
    assert.ok(owned.directory.startsWith(`${isolationRoot}${sep}`));
    assert.equal((await readFixtureOwner(owned.directory))?.label, "ownership");
    if (process.platform !== "win32") {
      assert.equal((await stat(owned.directory)).mode & 0o777, 0o700);
    }
    await cleanupIsolatedFixture(owned);
    await assert.rejects(stat(owned.directory), { code: "ENOENT" });

    // A path outside the isolation root is refused and left untouched.
    const foreign = await createIsolatedFixture(isolationRoot, "foreign");
    await assert.rejects(cleanupIsolatedFixture({ ...foreign, root: join(root, "unrelated") }), /outside the isolation root/u);
    assert.ok(await stat(foreign.directory));

    // A directory whose owner marker is gone is refused and left untouched.
    const unmarked = await createIsolatedFixture(isolationRoot, "unmarked");
    await rm(unmarked.markerPath);
    await assert.rejects(cleanupIsolatedFixture(unmarked), /owner marker/u);
    assert.ok(await stat(unmarked.directory));
  } finally {
    await cleanup(root);
  }
});
