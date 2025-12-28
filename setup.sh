#!/bin/bash
# Setup script for mcp-opener

set -e

echo "🚀 Setting up mcp-opener..."

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build TypeScript
echo "🔨 Building TypeScript..."
pnpm build

# Make executable
chmod +x dist/index.js

echo "✅ Setup complete!"
echo ""
echo "Add to your Claude Code MCP settings:"
echo ""
echo '{
  "mcpServers": {
    "opener": {
      "command": "node",
      "args": ["'$(pwd)'/dist/index.js"],
      "env": {
        "MCP_OPENER_BROWSER": "firefox"
      }
    }
  }
}'
