#!/usr/bin/env node
/**
 * MCP Opener Server
 *
 * Model Context Protocol server for opening files, folders, and browsers.
 * Handles OS-specific opening mechanisms including Flatpak Firefox on Fedora.
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve, basename } from 'path';
import { existsSync } from 'fs';
import { copyFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../../..');
config({ path: resolve(projectRoot, '.env') });

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Configuration for opener preferences
 */
interface OpenerConfig {
  preferredBrowser?: 'firefox' | 'chrome' | 'chromium' | 'default';
  firefoxFlatpak?: boolean; // Auto-detect if not specified
  tmpCopyForFlatpak?: boolean; // Whether to copy files to /tmp for Flatpak access
}

/**
 * Get configuration from environment
 */
export function getConfig(): OpenerConfig {
  return {
    preferredBrowser: (process.env.MCP_OPENER_BROWSER as OpenerConfig['preferredBrowser']) || 'firefox',
    firefoxFlatpak: process.env.MCP_OPENER_FIREFOX_FLATPAK === 'true' ? true : undefined,
    tmpCopyForFlatpak: process.env.MCP_OPENER_TMP_COPY !== 'false', // Default true
  };
}

/**
 * Detect platform
 */
export function getPlatform(): 'linux' | 'darwin' | 'win32' | 'unknown' {
  const platform = process.platform;
  if (platform === 'linux') return 'linux';
  if (platform === 'darwin') return 'darwin';
  if (platform === 'win32') return 'win32';
  return 'unknown';
}

/**
 * Check if a command exists
 */
export async function commandExists(command: string): Promise<boolean> {
  try {
    await execAsync(`which ${command}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect if Firefox is installed via Flatpak
 */
export async function detectFirefoxFlatpak(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('flatpak list --app');
    return stdout.includes('org.mozilla.firefox');
  } catch {
    return false;
  }
}

/**
 * Open a folder in file manager
 */
async function openFolder(path: string): Promise<string> {
  if (!existsSync(path)) {
    throw new Error(`Folder does not exist: ${path}`);
  }

  const platform = getPlatform();
  const absolutePath = resolve(path);

  try {
    switch (platform) {
      case 'linux':
        // Try xdg-open first (standard)
        if (await commandExists('xdg-open')) {
          await execAsync(`xdg-open "${absolutePath}"`);
          return `Opened folder in file manager: ${absolutePath}`;
        }
        // Fallback to specific file managers
        if (await commandExists('nautilus')) {
          await execAsync(`nautilus "${absolutePath}"`);
          return `Opened folder in Nautilus: ${absolutePath}`;
        }
        if (await commandExists('dolphin')) {
          await execAsync(`dolphin "${absolutePath}"`);
          return `Opened folder in Dolphin: ${absolutePath}`;
        }
        throw new Error('No file manager found (tried xdg-open, nautilus, dolphin)');

      case 'darwin':
        await execAsync(`open "${absolutePath}"`);
        return `Opened folder in Finder: ${absolutePath}`;

      case 'win32':
        await execAsync(`explorer "${absolutePath.replace(/\//g, '\\\\')}"`);
        return `Opened folder in Explorer: ${absolutePath}`;

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (error) {
    throw new Error(`Failed to open folder: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Open a file with default application
 */
async function openFile(path: string): Promise<string> {
  if (!existsSync(path)) {
    throw new Error(`File does not exist: ${path}`);
  }

  const platform = getPlatform();
  const absolutePath = resolve(path);

  try {
    switch (platform) {
      case 'linux':
        await execAsync(`xdg-open "${absolutePath}"`);
        return `Opened file with default application: ${absolutePath}`;

      case 'darwin':
        await execAsync(`open "${absolutePath}"`);
        return `Opened file with default application: ${absolutePath}`;

      case 'win32':
        await execAsync(`start "" "${absolutePath.replace(/\//g, '\\\\')}"`);
        return `Opened file with default application: ${absolutePath}`;

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (error) {
    throw new Error(`Failed to open file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Open a URL in browser
 */
async function openBrowser(url: string): Promise<string> {
  const config = getConfig();
  const platform = getPlatform();

  // Validate URL
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
    throw new Error('URL must start with http://, https://, or file://');
  }

  // Handle file:// URLs specially for Flatpak
  if (url.startsWith('file://')) {
    const filePath = url.replace('file://', '');
    if (!existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
  }

  try {
    // Linux with Firefox preference
    if (platform === 'linux' && config.preferredBrowser === 'firefox') {
      // Auto-detect Flatpak if not explicitly configured
      const isFirefoxFlatpak = config.firefoxFlatpak ?? await detectFirefoxFlatpak();

      if (isFirefoxFlatpak) {
        // Handle file:// URLs with Flatpak
        if (url.startsWith('file://') && config.tmpCopyForFlatpak) {
          const filePath = url.replace('file://', '');
          const tmpDir = await mkdtemp(resolve(tmpdir(), 'mcp-opener-'));
          const tmpFile = resolve(tmpDir, basename(filePath));
          await copyFile(filePath, tmpFile);

          const tmpUrl = `file://${tmpFile}`;
          await execAsync(`flatpak run org.mozilla.firefox "${tmpUrl}"`);

          // Clean up after a delay (file might still be in use)
          setTimeout(async () => {
            try {
              await rm(tmpDir, { recursive: true, force: true });
            } catch {
              // Ignore cleanup errors
            }
          }, 5000);

          return `Opened in Firefox (Flatpak, via /tmp): ${url}`;
        } else {
          await execAsync(`flatpak run org.mozilla.firefox "${url}"`);
          return `Opened in Firefox (Flatpak): ${url}`;
        }
      } else {
        // Native Firefox
        if (await commandExists('firefox')) {
          await execAsync(`firefox "${url}"`);
          return `Opened in Firefox: ${url}`;
        }
        // Fallback to xdg-open
        await execAsync(`xdg-open "${url}"`);
        return `Opened in default browser: ${url}`;
      }
    }

    // Other browsers or platforms
    switch (platform) {
      case 'linux':
        if (config.preferredBrowser === 'chrome' && await commandExists('google-chrome')) {
          await execAsync(`google-chrome "${url}"`);
          return `Opened in Chrome: ${url}`;
        }
        if (config.preferredBrowser === 'chromium' && await commandExists('chromium')) {
          await execAsync(`chromium "${url}"`);
          return `Opened in Chromium: ${url}`;
        }
        // Default to xdg-open
        await execAsync(`xdg-open "${url}"`);
        return `Opened in default browser: ${url}`;

      case 'darwin':
        if (config.preferredBrowser === 'firefox' && await commandExists('firefox')) {
          await execAsync(`firefox "${url}"`);
          return `Opened in Firefox: ${url}`;
        }
        if (config.preferredBrowser === 'chrome' && existsSync('/Applications/Google Chrome.app')) {
          await execAsync(`open -a "Google Chrome" "${url}"`);
          return `Opened in Chrome: ${url}`;
        }
        await execAsync(`open "${url}"`);
        return `Opened in default browser: ${url}`;

      case 'win32':
        if (config.preferredBrowser === 'firefox') {
          await execAsync(`start firefox "${url}"`);
          return `Opened in Firefox: ${url}`;
        }
        if (config.preferredBrowser === 'chrome') {
          await execAsync(`start chrome "${url}"`);
          return `Opened in Chrome: ${url}`;
        }
        await execAsync(`start "" "${url}"`);
        return `Opened in default browser: ${url}`;

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (error) {
    throw new Error(`Failed to open browser: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Tool definitions
 */
const TOOLS = [
  {
    name: 'open_folder',
    description: 'Open a folder in the system file manager (Nautilus, Finder, Explorer, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the folder to open',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'open_file',
    description: 'Open a file with its default application',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file to open',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'open_browser',
    description: 'Open a URL in the preferred web browser. Supports Firefox (including Flatpak), Chrome, and system default.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to open (must start with http://, https://, or file://)',
        },
      },
      required: ['url'],
    },
  },
];

/**
 * Initialize MCP server
 */
async function main() {
  const server = new Server(
    {
      name: 'opener-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'open_folder': {
          const path = (args as { path?: string })?.path;
          if (!path) {
            throw new Error('path is required');
          }

          const result = await openFolder(path);

          return {
            content: [
              {
                type: 'text',
                text: result,
              },
            ],
          };
        }

        case 'open_file': {
          const path = (args as { path?: string })?.path;
          if (!path) {
            throw new Error('path is required');
          }

          const result = await openFile(path);

          return {
            content: [
              {
                type: 'text',
                text: result,
              },
            ],
          };
        }

        case 'open_browser': {
          const url = (args as { url?: string })?.url;
          if (!url) {
            throw new Error('url is required');
          }

          const result = await openBrowser(url);

          return {
            content: [
              {
                type: 'text',
                text: result,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep process alive
  process.stdin.resume();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
