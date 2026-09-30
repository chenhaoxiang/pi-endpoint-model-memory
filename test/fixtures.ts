import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";

export async function fixture(prefix = "fixture"): Promise<string> {
  const root = resolve("tmp/tests");
  await mkdir(root, { recursive: true });
  return mkdtemp(join(root, `${prefix}-`));
}

export async function cleanup(directory: string): Promise<void> {
  const root = resolve("tmp/tests");
  if (!directory.startsWith(`${root}/`)) throw new Error("Not a test fixture");
  await rm(directory, { recursive: true, force: true });
}
