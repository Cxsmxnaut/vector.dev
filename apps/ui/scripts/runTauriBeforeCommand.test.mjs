import test from 'node:test';
import assert from 'node:assert/strict';

import { runTauriBeforeCommand } from './runTauriBeforeCommand.mjs';

test('runTauriBeforeCommand runs yarn prepare:build via cmd on Windows', () => {
  /** @type {any} */
  let call = null;
  runTauriBeforeCommand({
    mode: 'build',
    platform: 'win32',
    cwd: 'C:\\repo\\apps\\ui',
    env: { PATH: 'x' },
    execFileSync: (cmd, args, opts) => {
      call = { cmd, args, opts };
      return Buffer.from('');
    },
  });

  assert.equal(call.cmd, 'cmd');
  assert.deepEqual(call.args.slice(0, 3), ['/D', '/S', '/C']);
  assert.equal(call.args[3], 'yarn -s tauri:prepare:build');
  assert.equal(call.opts.cwd, 'C:\\repo\\apps\\ui');
  assert.equal(call.opts.env.EXPO_UNSTABLE_WEB_MODAL, '1');
  assert.equal(call.opts.env.EXPO_PUBLIC_HAPPIER_SERVER_URL, 'https://api.happier.dev');
});

test('runTauriBeforeCommand runs yarn prepare:dev via bash on macOS/Linux', () => {
  /** @type {any} */
  let call = null;
  runTauriBeforeCommand({
    mode: 'dev',
    platform: 'darwin',
    cwd: '/repo/apps/ui',
    env: { PATH: 'x' },
    execFileSync: (cmd, args, opts) => {
      call = { cmd, args, opts };
      return Buffer.from('');
    },
  });

  assert.equal(call.cmd, 'bash');
  assert.deepEqual(call.args, ['-lc', 'yarn -s tauri:prepare:dev']);
  assert.equal(call.opts.cwd, '/repo/apps/ui');
  assert.equal(call.opts.env.EXPO_UNSTABLE_WEB_MODAL, '1');
  assert.equal(call.opts.env.EXPO_PUBLIC_HAPPIER_SERVER_URL, undefined);
});

test('desktop builds preserve explicitly configured relays through every supported environment alias', () => {
  for (const key of ['EXPO_PUBLIC_HAPPIER_SERVER_URL', 'EXPO_PUBLIC_HAPPY_SERVER_URL', 'EXPO_PUBLIC_SERVER_URL']) {
    let actual;
    runTauriBeforeCommand({
      mode: 'build',
      platform: 'darwin',
      env: { [key]: 'https://relay.example.test' },
      execFileSync: (_cmd, _args, options) => {
        actual = options.env;
        return Buffer.from('');
      },
    });
    assert.equal(actual[key], 'https://relay.example.test');
    if (key !== 'EXPO_PUBLIC_HAPPIER_SERVER_URL') assert.equal(actual.EXPO_PUBLIC_HAPPIER_SERVER_URL, undefined);
  }
});

test('runTauriBeforeCommand rejects unknown mode', () => {
  assert.throws(() => {
    runTauriBeforeCommand({
      // @ts-expect-error - intentional invalid input for test
      mode: 'nope',
      platform: 'darwin',
      cwd: '/repo/apps/ui',
      env: { PATH: 'x' },
      execFileSync: () => Buffer.from(''),
    });
  }, /mode must be 'dev' or 'build'/);
});

