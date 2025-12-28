# MCP Opener

Model Context Protocol server for opening files, folders, and browsers across different operating systems. Designed specifically to handle Linux Flatpak Firefox complexities on distributions like Fedora Bluefin.

## Features

- **Open Folders**: Launch system file manager (Nautilus, Finder, Explorer, etc.)
- **Open Files**: Open files with their default applications
- **Open Browser**: Open URLs with configurable browser preferences
- **Flatpak Firefox Support**: Auto-detects and handles Flatpak Firefox installations
- **Cross-Platform**: Works on Linux, macOS, and Windows
- **Smart File Handling**: Automatically copies files to `/tmp` for Flatpak browser access when needed

## Installation

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Install globally (optional)
pnpm link --global
```

## Configuration

Configure via environment variables in your `.env` file or Claude Code MCP settings:

```bash
# Preferred browser: 'firefox' | 'chrome' | 'chromium' | 'default'
MCP_OPENER_BROWSER=firefox

# Explicitly set if Firefox is installed via Flatpak (auto-detected if omitted)
MCP_OPENER_FIREFOX_FLATPAK=true

# Whether to copy files to /tmp for Flatpak access (default: true)
MCP_OPENER_TMP_COPY=true
```

### Claude Code Configuration

Add to your Claude Code MCP settings (`.claude/settings.json` or global settings):

```json
{
  "mcpServers": {
    "opener": {
      "command": "node",
      "args": ["/path/to/mcp-opener/dist/index.js"],
      "env": {
        "MCP_OPENER_BROWSER": "firefox",
        "MCP_OPENER_FIREFOX_FLATPAK": "true",
        "MCP_OPENER_TMP_COPY": "true"
      }
    }
  }
}
```

Or using pnpm:

```json
{
  "mcpServers": {
    "opener": {
      "command": "pnpm",
      "args": ["--dir", "/path/to/mcp-opener", "exec", "node", "dist/index.js"],
      "env": {
        "MCP_OPENER_BROWSER": "firefox"
      }
    }
  }
}
```

## Tools

### `open_folder`

Opens a folder in the system file manager.

**Parameters:**
- `path` (string, required): Absolute or relative path to the folder

**Example:**
```typescript
{
  "path": "/home/user/Documents"
}
```

**Behavior by Platform:**
- **Linux**: Uses `xdg-open`, falls back to `nautilus` or `dolphin`
- **macOS**: Uses `open` (Finder)
- **Windows**: Uses `explorer`

---

### `open_file`

Opens a file with its default application.

**Parameters:**
- `path` (string, required): Absolute or relative path to the file

**Example:**
```typescript
{
  "path": "./report.pdf"
}
```

**Behavior by Platform:**
- **Linux**: Uses `xdg-open`
- **macOS**: Uses `open`
- **Windows**: Uses `start`

---

### `open_browser`

Opens a URL in the preferred web browser.

**Parameters:**
- `url` (string, required): URL to open (must start with `http://`, `https://`, or `file://`)

**Example:**
```typescript
{
  "url": "https://github.com"
}
```

**Behavior:**
1. Checks configured browser preference (`MCP_OPENER_BROWSER`)
2. On Linux with Firefox:
   - Auto-detects Flatpak installation
   - For `file://` URLs with Flatpak: Copies file to `/tmp` for accessibility
   - Uses `flatpak run org.mozilla.firefox` for Flatpak
   - Uses native `firefox` command otherwise
3. Falls back to system default browser if preferred browser unavailable

**Special Handling for Fedora Bluefin / Flatpak Firefox:**

When opening local HTML files or other file:// URLs with Flatpak Firefox:
1. File is copied to `/tmp/mcp-opener-<random>/`
2. Browser opens the `/tmp` copy
3. Cleanup happens after 5 seconds

This works around Flatpak's filesystem sandboxing restrictions.

## Platform Support

| Platform | File Manager | Browser Detection | Flatpak Support |
|----------|--------------|-------------------|-----------------|
| Linux    | xdg-open, Nautilus, Dolphin | ✅ | ✅ |
| macOS    | Finder | ✅ | N/A |
| Windows  | Explorer | ✅ | N/A |

## Usage Examples

### From Claude Code

```
User: Open my Downloads folder
Agent: [Uses open_folder tool with path: /home/user/Downloads]

User: Open this README file
Agent: [Uses open_file tool with path: ./README.md]

User: Open GitHub in my browser
Agent: [Uses open_browser tool with url: https://github.com]

User: Preview this HTML file
Agent: [Uses open_browser tool with url: file:///home/user/project/index.html]
      [On Flatpak Firefox: Copies to /tmp, opens copy, cleans up]
```

### Direct Tool Calls

```json
// Open folder
{
  "name": "open_folder",
  "arguments": {
    "path": "/home/viky/Code"
  }
}

// Open file
{
  "name": "open_file",
  "arguments": {
    "path": "./package.json"
  }
}

// Open browser
{
  "name": "open_browser",
  "arguments": {
    "url": "https://anthropic.com"
  }
}
```

## Error Handling

The server provides detailed error messages:

- **File/folder not found**: `"File does not exist: /path/to/file"`
- **Invalid URL**: `"URL must start with http://, https://, or file://"`
- **Platform not supported**: `"Unsupported platform: <platform>"`
- **No file manager found**: `"No file manager found (tried xdg-open, nautilus, dolphin)"`

## Development

```bash
# Watch mode for development
pnpm dev

# Build for production
pnpm build

# Test the server manually
echo '{"method":"tools/list"}' | node dist/index.js
```

## Troubleshooting

### Flatpak Firefox not detected

Check if Firefox is installed via Flatpak:
```bash
flatpak list --app | grep firefox
```

If installed, you should see `org.mozilla.firefox`. Set `MCP_OPENER_FIREFOX_FLATPAK=true` explicitly if auto-detection fails.

### Files not opening in Flatpak Firefox

Ensure `MCP_OPENER_TMP_COPY=true` (default). The server will copy files to `/tmp` for Flatpak accessibility.

### Wrong browser opens

Set `MCP_OPENER_BROWSER` explicitly:
```bash
MCP_OPENER_BROWSER=firefox
# or
MCP_OPENER_BROWSER=chrome
# or
MCP_OPENER_BROWSER=default
```

## License

MIT

## Author

3viky

## Contributing

Issues and PRs welcome at [github.com/3viky/mcp-opener](https://github.com/3viky/mcp-opener)
