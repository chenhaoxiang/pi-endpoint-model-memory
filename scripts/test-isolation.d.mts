export interface IsolatedEnvPaths {
  home: string;
  agent: string;
  tmp: string;
  xdgConfig: string;
  xdgCache: string;
  xdgData: string;
  xdgState: string;
}

export interface IsolatedFixture {
  root: string;
  label: string;
  directory: string;
  markerPath: string;
  paths: IsolatedEnvPaths;
}

export interface IsolatedFixtureOwner {
  kind?: string;
  label?: string;
  pid?: number;
  createdAt?: string;
}

export interface IsolatedEnv {
  env: Record<string, string>;
  allowedKeys: string[];
  droppedKeys: string[];
}

export interface IsolationSummary {
  homeInsideFixture: boolean;
  homeIsRealHome: boolean;
  adcInsideFixture: boolean;
  fixture: string;
}

export const OWNER_MARKER: string;
export const OWNER_KIND: string;
export const ISOLATION_ENV_MARKER: string;

export function allowedParentEnvKeys(platform?: string): string[];
export function createIsolatedFixture(root: string, label: string): Promise<IsolatedFixture>;
export function readFixtureOwner(directory: string): Promise<IsolatedFixtureOwner | undefined>;
export function cleanupIsolatedFixture(fixture: IsolatedFixture): Promise<void>;
export function isolatedEnv(
  fixture: IsolatedFixture,
  parentEnv?: Record<string, string | undefined>,
  platform?: string,
): IsolatedEnv;
export function isolationSummary(
  fixture: IsolatedFixture,
  parentEnv?: Record<string, string | undefined>,
): IsolationSummary;
export function combinedExitCode(input: { childExitCode: number; cleanupFailed: boolean }): number;
