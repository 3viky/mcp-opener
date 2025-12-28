/**
 * Unit tests for mcp-opener utility functions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getConfig, getPlatform, commandExists, detectFirefoxFlatpak } from '../src/index.js';
import { exec } from 'child_process';
import { promisify } from 'util';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

const execAsync = promisify(exec);

describe('getConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear environment before each test
    process.env = { ...originalEnv };
    delete process.env.MCP_OPENER_BROWSER;
    delete process.env.MCP_OPENER_FIREFOX_FLATPAK;
    delete process.env.MCP_OPENER_TMP_COPY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default configuration when no env vars are set', () => {
    const config = getConfig();

    expect(config.preferredBrowser).toBe('firefox');
    expect(config.firefoxFlatpak).toBeUndefined();
    expect(config.tmpCopyForFlatpak).toBe(true);
  });

  it('should respect MCP_OPENER_BROWSER env var', () => {
    process.env.MCP_OPENER_BROWSER = 'chrome';
    const config = getConfig();

    expect(config.preferredBrowser).toBe('chrome');
  });

  it('should respect MCP_OPENER_FIREFOX_FLATPAK env var', () => {
    process.env.MCP_OPENER_FIREFOX_FLATPAK = 'true';
    const config = getConfig();

    expect(config.firefoxFlatpak).toBe(true);
  });

  it('should respect MCP_OPENER_TMP_COPY env var', () => {
    process.env.MCP_OPENER_TMP_COPY = 'false';
    const config = getConfig();

    expect(config.tmpCopyForFlatpak).toBe(false);
  });

  it('should handle all supported browsers', () => {
    const browsers: Array<'firefox' | 'chrome' | 'chromium' | 'default'> = [
      'firefox',
      'chrome',
      'chromium',
      'default',
    ];

    browsers.forEach((browser) => {
      process.env.MCP_OPENER_BROWSER = browser;
      const config = getConfig();
      expect(config.preferredBrowser).toBe(browser);
    });
  });
});

describe('getPlatform', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    // Restore original platform
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  it('should return "linux" for Linux platform', () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });
    expect(getPlatform()).toBe('linux');
  });

  it('should return "darwin" for macOS platform', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    expect(getPlatform()).toBe('darwin');
  });

  it('should return "win32" for Windows platform', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
    });
    expect(getPlatform()).toBe('win32');
  });

  it('should return "unknown" for unsupported platforms', () => {
    Object.defineProperty(process, 'platform', {
      value: 'freebsd',
    });
    expect(getPlatform()).toBe('unknown');
  });
});

describe('commandExists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when command exists', async () => {
    vi.mocked(exec).mockImplementation((cmd, callback: any) => {
      callback(null, { stdout: '/usr/bin/firefox', stderr: '' });
      return {} as any;
    });

    const exists = await commandExists('firefox');
    expect(exists).toBe(true);
  });

  it('should return false when command does not exist', async () => {
    vi.mocked(exec).mockImplementation((cmd, callback: any) => {
      callback(new Error('Command not found'), null);
      return {} as any;
    });

    const exists = await commandExists('nonexistent-command');
    expect(exists).toBe(false);
  });

  it('should handle various command names', async () => {
    const commands = ['firefox', 'chrome', 'xdg-open', 'nautilus'];

    for (const command of commands) {
      vi.mocked(exec).mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: `/usr/bin/${command}`, stderr: '' });
        return {} as any;
      });

      const exists = await commandExists(command);
      expect(exists).toBe(true);
    }
  });
});

describe('detectFirefoxFlatpak', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when Firefox Flatpak is installed', async () => {
    vi.mocked(exec).mockImplementation((cmd, callback: any) => {
      const mockOutput = `Name                         Application ID                   Version        Branch Installation
Firefox                      org.mozilla.firefox              133.0          stable system`;
      callback(null, { stdout: mockOutput, stderr: '' });
      return {} as any;
    });

    const detected = await detectFirefoxFlatpak();
    expect(detected).toBe(true);
  });

  it('should return false when Firefox Flatpak is not installed', async () => {
    vi.mocked(exec).mockImplementation((cmd, callback: any) => {
      const mockOutput = `Name                         Application ID                   Version        Branch Installation
GIMP                         org.gimp.GIMP                    2.10           stable system`;
      callback(null, { stdout: mockOutput, stderr: '' });
      return {} as any;
    });

    const detected = await detectFirefoxFlatpak();
    expect(detected).toBe(false);
  });

  it('should return false when flatpak command fails', async () => {
    vi.mocked(exec).mockImplementation((cmd, callback: any) => {
      callback(new Error('Flatpak not installed'), null);
      return {} as any;
    });

    const detected = await detectFirefoxFlatpak();
    expect(detected).toBe(false);
  });

  it('should handle empty flatpak list', async () => {
    vi.mocked(exec).mockImplementation((cmd, callback: any) => {
      callback(null, { stdout: '', stderr: '' });
      return {} as any;
    });

    const detected = await detectFirefoxFlatpak();
    expect(detected).toBe(false);
  });
});

describe('Integration: Configuration with platform detection', () => {
  it('should provide consistent configuration across different platforms', () => {
    const platforms = ['linux', 'darwin', 'win32'];

    platforms.forEach((platform) => {
      Object.defineProperty(process, 'platform', {
        value: platform,
      });

      const config = getConfig();
      const detectedPlatform = getPlatform();

      expect(config).toHaveProperty('preferredBrowser');
      expect(config).toHaveProperty('firefoxFlatpak');
      expect(config).toHaveProperty('tmpCopyForFlatpak');
      expect(['linux', 'darwin', 'win32', 'unknown']).toContain(detectedPlatform);
    });
  });
});
