# Gist Tools for Scout Extension

This document describes the two new tools added to the Scout extension for managing GitHub Gists.

## Overview

Two new tools have been added to enable downloading and uploading GitHub Gists:

1. **download_gist** - Downloads/clones a GitHub Gist to a temporary directory
2. **upload_gist** - Updates a GitHub Gist by committing and pushing changes

## Tools

### download_gist

**Purpose:** Clone a GitHub Gist to a temporary directory for local manipulation.

**Parameters:**
- `gistId` (string, required): GitHub Gist ID or full Gist URL
  - Examples: `"abc123def456"` or `"https://gist.github.com/username/abc123def456"`

**Returns:**
- Markdown document with:
  - Gist ID
  - Local directory path (temporary directory in system temp folder)
  - Gist URL
  - List of files in the cloned directory

**Example Usage:**
```json
{
  "gistId": "abc123def456"
}
```

or

```json
{
  "gistId": "https://gist.github.com/username/abc123def456"
}
```

**Notes:**
- Uses `git clone` to download the Gist
- Creates a temporary directory with prefix `gist-{id}-`
- Directory persists after tool execution (not automatically cleaned up)
- Requires git to be installed and available in PATH

---

### upload_gist

**Purpose:** Update a GitHub Gist by committing and pushing changes from a local directory.

**Parameters:**
- `directory` (string, required): Path to the directory containing the Gist files
  - Must be a git repository cloned from a Gist
  - Can be relative or absolute path
- `commitMessage` (string, optional): Commit message for the update
  - Default: `"Update gist files"`

**Returns:**
- Markdown document with:
  - Gist ID
  - Directory path
  - Gist URL
  - Commit details (hash, author, date, message)
  - Push output

**Example Usage:**
```json
{
  "directory": "/tmp/gist-abc123def456-xyz",
  "commitMessage": "Updated configuration files"
}
```

**Validation:**
- Checks that the directory exists and is a directory
- Validates that it's a git repository
- Verifies the remote URL is a GitHub Gist URL
- Detects if there are changes to commit (returns early if no changes)

**Notes:**
- All changes in the directory are staged with `git add -A`
- Pushes to the current branch (auto-detected, typically `master` for Gists)
- **Important:** Gists are flat repositories - they cannot contain subdirectories
- Requires git to be configured with GitHub authentication (HTTPS token or SSH)

## Implementation Details

### Files Created/Modified

1. **Created:**
   - `extensions/specialized-subagents/subagents/scout/tools/download-gist.ts`
   - `extensions/specialized-subagents/subagents/scout/tools/upload-gist.ts`

2. **Modified:**
   - `extensions/specialized-subagents/subagents/scout/tools/index.ts` - Added exports
   - `extensions/specialized-subagents/subagents/scout/tool-formatter.ts` - Added formatting for new tools
   - `extensions/specialized-subagents/subagents/scout/system-prompt.ts` - Updated system prompt to document new tools

### Key Features

**download_gist:**
- Extracts Gist ID from either raw ID or full URL
- Creates unique temporary directory for each download
- Uses native git commands for cloning
- Lists files after successful clone

**upload_gist:**
- Validates directory is a cloned Gist repository
- Auto-detects current git branch
- Checks for changes before committing
- Provides detailed commit information
- Handles errors gracefully with descriptive messages

### Error Handling

Both tools provide clear error messages for common issues:
- Invalid Gist ID/URL format
- Directory doesn't exist (upload_gist)
- Not a git repository (upload_gist)
- Not a Gist repository (upload_gist)
- Git command failures
- Network/authentication issues

## Workflow Example

Here's a typical workflow using both tools together:

1. **Download a Gist:**
   ```json
   {
     "gistId": "https://gist.github.com/username/abc123def456"
   }
   ```
   Returns: `/tmp/gist-abc123def456-xyz123/`

2. **Make changes to files in the directory** (using other tools or manual edits)

3. **Upload the changes:**
   ```json
   {
     "directory": "/tmp/gist-abc123def456-xyz123/",
     "commitMessage": "Fixed typo in README"
   }
   ```

## Limitations

1. **Flat Structure:** Gists cannot contain subdirectories - all files must be in the root directory
2. **Authentication:** Requires git to be configured with GitHub authentication for upload
3. **Manual Cleanup:** Downloaded temporary directories are not automatically cleaned up
4. **Single Remote:** Assumes standard Gist setup with origin remote

## Future Enhancements

Possible improvements for future versions:
- Auto-cleanup of temporary directories after a configurable timeout
- Support for creating new Gists (not just updating existing ones)
- Better handling of large Gists with many files
- Progress indicators for long-running operations
- Support for Gist privacy settings (public/private)
