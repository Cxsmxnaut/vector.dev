import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WINDOWS_SERVICE_LAUNCHER_BUILD_VERSION = '1';
export const WINDOWS_SERVICE_LAUNCHER_FILE_NAME = 'happier-service-launcher.exe';
export const WINDOWS_SERVICE_LAUNCHER_PROVENANCE_MARKER = 'HAPPIER_SERVICE_LAUNCHER_V1';

export type WindowsServiceLauncherInstallSpec = Readonly<{
  sourcePath: string;
  version: string;
}>;

export function resolvePackagedWindowsServiceLauncherInstallSpec(): WindowsServiceLauncherInstallSpec {
  const executableSidecar = join(dirname(process.execPath), WINDOWS_SERVICE_LAUNCHER_FILE_NAME);
  const packageAsset = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'native',
    'windows',
    'bin',
    'windows-x64',
    WINDOWS_SERVICE_LAUNCHER_FILE_NAME,
  );
  return {
    sourcePath: existsSync(executableSidecar) ? executableSidecar : packageAsset,
    version: WINDOWS_SERVICE_LAUNCHER_BUILD_VERSION,
  };
}

export function resolveInstalledWindowsServiceLauncherPaths(params: Readonly<{
  definitionPath: string;
  label: string;
  version: string;
}>): Readonly<{ launcherPath: string; diagnosticLogPath: string }> {
  const definitionPath = String(params.definitionPath ?? '').trim();
  if (!definitionPath) throw new Error('definitionPath is required for Windows service launcher paths');
  const label = sanitizeWindowsServiceLauncherSegment(params.label, 'label');
  const version = sanitizeWindowsServiceLauncherSegment(params.version, 'version');
  const definition = win32.parse(definitionPath);
  return {
    launcherPath: win32.join(definition.dir, label, `launcher-${version}`, WINDOWS_SERVICE_LAUNCHER_FILE_NAME),
    diagnosticLogPath: win32.join(definition.dir, `${definition.name}.launcher.log`),
  };
}

export async function readValidatedWindowsServiceLauncher(path: string): Promise<Buffer> {
  const sourcePath = String(path ?? '').trim();
  if (!sourcePath) throw new Error('[service] Windows service launcher source path is required');
  let bytes: Buffer;
  try {
    bytes = await readFile(sourcePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
    throw new Error(
      `[service] packaged Windows service launcher is unavailable: ${sourcePath}: ${message}. `
      + 'Source checkouts must build it with scripts/pipeline/release/build-windows-service-launcher.mjs; installed packages must include the prebuilt asset.',
    );
  }
  validateWindowsServiceLauncherPe(bytes, sourcePath);
  return bytes;
}

export function validateWindowsServiceLauncherPe(bytes: Uint8Array, source = 'Windows service launcher'): void {
  const fail = (reason: string): never => {
    throw new Error(`[service] invalid ${source}: ${reason}`);
  };
  if (bytes.byteLength < 256) fail('file is too small to be a PE executable');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== 0x5a4d) fail('missing MZ header');
  const peOffset = view.getUint32(0x3c, true);
  if (peOffset < 0x40 || peOffset + 24 + 70 > bytes.byteLength) fail('invalid PE header offset');
  if (view.getUint32(peOffset, true) !== 0x00004550) fail('missing PE signature');
  if (view.getUint16(peOffset + 4, true) !== 0x8664) fail('expected x64 PE machine');
  const optionalHeaderOffset = peOffset + 24;
  if (view.getUint16(optionalHeaderOffset, true) !== 0x20b) fail('expected PE32+ optional header');
  if (view.getUint16(optionalHeaderOffset + 68, true) !== 2) fail('expected Windows GUI subsystem');
  if (!Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(Buffer.from(WINDOWS_SERVICE_LAUNCHER_PROVENANCE_MARKER, 'ascii'))) {
    fail(`missing provenance marker ${WINDOWS_SERVICE_LAUNCHER_PROVENANCE_MARKER}`);
  }
}

function sanitizeWindowsServiceLauncherSegment(value: string, field: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized || !/^[A-Za-z0-9._-]+$/u.test(normalized) || normalized === '.' || normalized === '..') {
    throw new Error(`invalid Windows service launcher ${field}: ${normalized || '(empty)'}`);
  }
  return normalized;
}
