# Neovim Extension for Pi

Bidirectional integration between Pi and Neovim.

## Features

**Pi Extension (for the agent):**
- `nvim_context` tool: Query editor state (context, splits, diagnostics, current_function)
- Auto-connect to Neovim on session start
- Inject visible splits into system prompt
- Reload files in Neovim after write/edit
- Send LSP errors for modified files at turn end

**Neovim Plugin (for the editor):**
- RPC server exposing editor state
- Terminal integration for Pi CLI

## Installation

### 1. Pi Extension

Symlink or copy to Pi extensions directory:

```bash
# If pi-extensions is cloned locally:
ln -sf /path/to/pi-extensions/extensions/neovim ~/.pi/agent/extensions/neovim

# Or copy:
cp -R /path/to/pi-extensions/extensions/neovim ~/.pi/agent/extensions/
```

### 2. Neovim Plugin

Add the extension to your Neovim runtimepath. The `lua/` directory at the extension root is runtimepath-compatible.

**lazy.nvim:**
```lua
{
  dir = "~/.pi/agent/extensions/neovim",
  config = function()
    require("pi-nvim").setup()
  end
}
```

**mini.deps:**
```lua
local add = MiniDeps.add
add({ source = "~/.pi/agent/extensions/neovim" })
require("pi-nvim").setup()
```

**packer.nvim:**
```lua
use {
  "~/.pi/agent/extensions/neovim",
  config = function()
    require("pi-nvim").setup()
  end
}
```

**Manual:**
```lua
-- In init.lua
vim.opt.runtimepath:append(vim.fn.expand("~/.pi/agent/extensions/neovim"))
require("pi-nvim").setup()
```

## Configuration

```lua
require("pi-nvim").setup({
  auto_start = true,  -- Start RPC server automatically (default: true)

  -- Optional Pi CLI flags
  models = nil,       -- e.g., "sonnet:high,haiku:low"
  provider = nil,     -- e.g., "anthropic"
  model = nil,        -- e.g., "claude-sonnet-4-20250514"
  thinking = nil,     -- off|minimal|low|medium|high|xhigh
  extra_args = nil,   -- Additional CLI arguments

  -- Window configuration
  win = {
    layout = 'auto',           -- auto|right|left|top|bottom|float
    width_threshold = 150,     -- Columns threshold for "auto"
    width = 80,                -- Split width for left/right
    height = 20,               -- Split height for top/bottom
    focus_source_on_stopinsert = true,
    keys = {
      close = { '<C-q>', mode = 'n', desc = 'Close Pi' },
      stopinsert = { '<C-q>', mode = 't', desc = 'Exit terminal mode' },
      suspend = { '<C-z>', mode = 't', desc = 'Suspend Neovim' },
      picker = { '<C-Space>', mode = 't', desc = 'Open context picker' },
    },
  },
})
```

## Keymaps

The plugin doesn't set any keymaps by default. Example mappings:

```lua
vim.keymap.set('n', '<leader>po', require('pi-nvim').open, { desc = 'Open Pi' })
vim.keymap.set('n', '<leader>pc', require('pi-nvim').close, { desc = 'Close Pi' })
vim.keymap.set('n', '<leader>pp', require('pi-nvim').toggle, { desc = 'Toggle Pi' })
```

## Usage

### From Pi (agent)

The `nvim_context` tool is available with these actions:
- `context`: Focused file, cursor position, selection, filetype
- `splits`: All visible splits with metadata (excludes help, quickfix, terminal buffers)
- `diagnostics`: LSP diagnostics for current buffer
- `current_function`: Treesitter info about function at cursor

### From Neovim

Commands:
- `:PiNvimStatus` - Show RPC server and terminal status

API:
- `require("pi-nvim").open()` - Open Pi terminal
- `require("pi-nvim").close()` - Close Pi terminal
- `require("pi-nvim").toggle()` - Toggle Pi terminal

## Troubleshooting

1. **Pi can't find Neovim:**
   - Ensure `nvim` is on PATH
   - Check `:PiNvimStatus` shows RPC is running
   - Verify lockfile exists: `ls ~/.local/share/nvim/pi-nvim/`

2. **Multiple Neovim instances:**
   - Pi will prompt to select one
   - Each instance in same directory creates a lockfile

3. **RPC server errors:**
   - Check log file: `~/.local/state/nvim/pi-nvim/rpc.log`

4. **Healthcheck:**
   ```vim
   :checkhealth pi-nvim
   ```

## Architecture

```
Pi Extension (TypeScript)          Neovim Plugin (Lua)
+---------------------+            +---------------------+
| nvim_context tool   |---RPC---->| pi-nvim.query()     |
| hooks (lifecycle)   |  (nvim    | actions/            |
| nvim.ts (discover)  |  --remote | rpc/server          |
+---------------------+   -expr)  +---------------------+
                            |
                            v
                    Unix socket + lockfile
                    ~/.local/share/nvim/pi-nvim/
```

The Pi extension discovers Neovim instances via lockfiles, then queries them using `nvim --remote-expr` which evaluates `require("pi-nvim").query(action)`.
