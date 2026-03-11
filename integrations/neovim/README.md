# Neovim integration for Pi

Bidirectional integration between Pi and Neovim.

This package should be thought of as a Neovim plugin that bundles the Pi extension it needs. You do not install the Pi extension separately. When `pi-nvim` starts Pi, it adds the bundled extension automatically for that Pi process.

## Features

**Bundled Pi extension (used by the agent):**
- `nvim_context` tool: Query editor state (context, splits, diagnostics, current_function)
- Auto-connect to Neovim on session start
- Inject visible splits into system prompt
- Reload files in Neovim after write/edit
- Send LSP errors for modified files at turn end
- `/neovim:settings` command to configure Neovim integration behavior

**Neovim plugin (installed in the editor):**
- RPC server exposing editor state
- Terminal integration for Pi CLI

## Installation

Install this package as a Neovim plugin. The `lua/` directory at the package root is runtimepath-compatible.

**lazy.nvim:**
```lua
{
  dir = "/path/to/pi-harness/integrations/neovim",
  config = function()
    require("pi-nvim").setup()
  end
}
```

**mini.deps:**
```lua
local add = MiniDeps.add
add({ source = "/path/to/pi-harness/integrations/neovim" })
require("pi-nvim").setup()
```

**packer.nvim:**
```lua
use {
  "/path/to/pi-harness/integrations/neovim",
  config = function()
    require("pi-nvim").setup()
  end
}
```

**Manual:**
```lua
-- In init.lua
vim.opt.runtimepath:append(vim.fn.expand("/path/to/pi-harness/integrations/neovim"))
require("pi-nvim").setup()
```

When you open Pi through `pi-nvim`, the plugin starts Pi with the bundled extension enabled.


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

Settings command:
- `/neovim:settings` - Edit Neovim integration settings
  - `Connection status messages`: `on/off` (global scope only, default: `on`)

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
   - Discovery matches exact CWD first, then Neovim instances whose CWD is a child of Pi's CWD

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
