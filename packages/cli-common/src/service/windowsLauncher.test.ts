import { describe, expect, it } from 'vitest';

import {
  resolveInstalledWindowsServiceLauncherPaths,
  validateWindowsServiceLauncherPe,
  WINDOWS_SERVICE_LAUNCHER_PROVENANCE_MARKER,
} from './windowsLauncher';

function createPeFixture(overrides: Readonly<{
  machine?: number;
  optionalMagic?: number;
  subsystem?: number;
}> = {}): Buffer {
  const bytes = Buffer.alloc(512);
  bytes.writeUInt16LE(0x5a4d, 0);
  bytes.writeUInt32LE(0x80, 0x3c);
  bytes.writeUInt32LE(0x00004550, 0x80);
  bytes.writeUInt16LE(overrides.machine ?? 0x8664, 0x84);
  bytes.writeUInt16LE(overrides.optionalMagic ?? 0x20b, 0x98);
  bytes.writeUInt16LE(overrides.subsystem ?? 2, 0x98 + 68);
  bytes.write(WINDOWS_SERVICE_LAUNCHER_PROVENANCE_MARKER, 0x120, 'ascii');
  return bytes;
}

describe('Windows service launcher asset', () => {
  it('uses a versioned task-owned path and a sibling diagnostic log', () => {
    expect(resolveInstalledWindowsServiceLauncherPaths({
      definitionPath: 'C:\\Users\\Zoë & QA\\.happier\\services\\happier-daemon.default.ps1',
      label: 'happier-daemon.default',
      version: '17',
    })).toEqual({
      launcherPath: 'C:\\Users\\Zoë & QA\\.happier\\services\\happier-daemon.default\\launcher-17\\happier-service-launcher.exe',
      diagnosticLogPath: 'C:\\Users\\Zoë & QA\\.happier\\services\\happier-daemon.default.launcher.log',
    });
  });

  it('accepts only an x64 PE32+ GUI executable', () => {
    expect(() => validateWindowsServiceLauncherPe(createPeFixture())).not.toThrow();
    expect(() => validateWindowsServiceLauncherPe(createPeFixture({ machine: 0x14c }))).toThrow(/x64/u);
    expect(() => validateWindowsServiceLauncherPe(createPeFixture({ optionalMagic: 0x10b }))).toThrow(/PE32\+/u);
    expect(() => validateWindowsServiceLauncherPe(createPeFixture({ subsystem: 3 }))).toThrow(/GUI subsystem/u);
    expect(() => validateWindowsServiceLauncherPe(Buffer.from(createPeFixture()).fill(0, 0x120))).toThrow(/provenance marker/u);
  });
});
