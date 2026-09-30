import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Endpoint } from "./endpoint.js";
import { validIdentifier } from "./endpoint.js";

export interface MemoryRecord {
  version: 1;
  endpointKey: string;
  provider: string;
  modelId: string;
  updatedAt: string;
}

export interface MemoryStore {
  read(endpoint: Endpoint): Promise<MemoryRecord | undefined>;
  remember(endpoint: Endpoint, modelId: string): Promise<void>;
  forget(endpoint: Endpoint): Promise<void>;
}

function recordPath(directory: string, endpoint: Endpoint): string {
  if (!/^[a-f0-9]{64}$/u.test(endpoint.key) || !validIdentifier(endpoint.provider)) {
    throw new Error("Invalid endpoint identity");
  }
  return join(directory, `${endpoint.key}.json`);
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function validate(value: unknown, endpoint: Endpoint): MemoryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid memory record");
  const record = value as Partial<MemoryRecord>;
  if (record.version !== 1 || record.endpointKey !== endpoint.key || record.provider !== endpoint.provider ||
      !validIdentifier(record.modelId) || typeof record.updatedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(record.updatedAt) ||
      !Number.isFinite(Date.parse(record.updatedAt)) ||
      new Date(record.updatedAt).toISOString() !== record.updatedAt) throw new Error("Invalid memory record");
  // Project the allowed fields instead of returning arbitrary disk content.
  return {
    version: 1, endpointKey: endpoint.key, provider: endpoint.provider,
    modelId: record.modelId, updatedAt: record.updatedAt,
  };
}

/** One independent atomic file per endpoint: no shared-map read/modify/write race. */
export class FileMemoryStore implements MemoryStore {
  private pending: Promise<void> = Promise.resolve();

  constructor(readonly directory: string) {}

  async read(endpoint: Endpoint): Promise<MemoryRecord | undefined> {
    await this.pending;
    let file;
    try {
      file = await open(recordPath(this.directory, endpoint), "r");
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > 8192) throw new Error("Invalid memory file");
      return validate(JSON.parse(await file.readFile("utf8")), endpoint);
    } finally {
      await file.close();
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => {});
    return result;
  }

  remember(endpoint: Endpoint, modelId: string): Promise<void> {
    const destination = recordPath(this.directory, endpoint);
    if (!validIdentifier(modelId)) return Promise.reject(new Error("Invalid model ID"));
    const record: MemoryRecord = {
      version: 1, endpointKey: endpoint.key, provider: endpoint.provider,
      modelId, updatedAt: new Date().toISOString(),
    };
    return this.enqueue(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporary = join(this.directory, `.${endpoint.key}.${process.pid}.${randomUUID()}.tmp`);
      try {
        const file = await open(temporary, "wx", 0o600);
        try {
          await file.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, destination);
      } finally {
        // Only this operation's unique temporary file is ever removed.
        await unlink(temporary).catch((error: unknown) => { if (!isMissing(error)) throw error; });
      }
    });
  }

  forget(endpoint: Endpoint): Promise<void> {
    const destination = recordPath(this.directory, endpoint);
    return this.enqueue(async () => {
      await unlink(destination).catch((error: unknown) => { if (!isMissing(error)) throw error; });
    });
  }
}
