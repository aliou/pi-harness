#!/bin/bash
# SessionStart hook to symlink .pi/skills to .agent/skills
# This makes skills available to Claude Code's standard skills location

set -e

# Use CLAUDE_PROJECT_DIR if available, otherwise use script's directory
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

PI_SKILLS="$PROJECT_DIR/.pi/skills"
AGENT_DIR="$PROJECT_DIR/.agent"
AGENT_SKILLS="$AGENT_DIR/skills"

# Check if .pi/skills exists
if [ ! -d "$PI_SKILLS" ]; then
    exit 0
fi

# Check if symlink already exists and is correct
if [ -L "$AGENT_SKILLS" ]; then
    # Symlink exists, verify it points to the right place
    LINK_TARGET=$(readlink "$AGENT_SKILLS")
    if [ "$LINK_TARGET" = "$PI_SKILLS" ] || [ "$LINK_TARGET" = "../.pi/skills" ]; then
        exit 0
    fi
fi

# Check if .agent/skills exists as a regular directory (not symlink)
if [ -d "$AGENT_SKILLS" ] && [ ! -L "$AGENT_SKILLS" ]; then
    # It's a real directory, don't overwrite
    exit 0
fi

# Create .agent directory if it doesn't exist
mkdir -p "$AGENT_DIR"

# Remove existing symlink if it exists but points to wrong location
if [ -L "$AGENT_SKILLS" ]; then
    rm "$AGENT_SKILLS"
fi

# Create the symlink (use relative path for portability)
ln -s "../.pi/skills" "$AGENT_SKILLS"

echo "Symlinked .pi/skills to .agent/skills"
