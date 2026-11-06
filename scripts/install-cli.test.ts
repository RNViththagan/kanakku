import { describe, expect, it } from 'vitest';
import { launcherFor } from './install-cli.mjs';

describe('launcherFor', () => {
  it('writes a shell launcher on macOS and Linux', () => {
    expect(launcherFor('darwin', '/repo/packages/server/bin/kanakku.mjs')).toBe(
      '#!/bin/sh\nexec node "/repo/packages/server/bin/kanakku.mjs" "$@"\n',
    );
  });

  it('writes a cmd launcher on Windows', () => {
    expect(launcherFor('win32', 'C:\\repo\\kanakku.mjs')).toBe(
      '@echo off\r\nnode "C:\\repo\\kanakku.mjs" %*\r\n',
    );
  });
});
