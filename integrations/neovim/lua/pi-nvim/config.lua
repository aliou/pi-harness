local M = {}

---@class pi.Keymap
---@field [1] string Key
---@field mode? string|string[] Mode(s)
---@field desc? string Description

---@class pi.WinConfig
---@field layout "auto"|"right"|"left"|"top"|"bottom"|"float"
---@field width_threshold number Columns threshold for "auto" (default: 150)
---@field width number Split width for left/right (default: 80)
---@field height number Split height for top/bottom (default: 20)
---@field keys table<string, pi.Keymap|false>
---@field focus_source_on_stopinsert boolean Switch to source window on stopinsert (default: true)

---@class pi.Config
---@field auto_start? boolean Start RPC server on setup (default: true)
---@field data_dir? string Override for lockfile/socket directory
---@field models? string Pi --models flag (e.g., "sonnet:high,haiku:low")
---@field provider? string Pi --provider flag
---@field model? string Pi --model flag
---@field thinking? string Pi --thinking flag (off|minimal|low|medium|high|xhigh)
---@field extra_args? string[] Additional CLI arguments
---@field win? pi.WinConfig Window configuration

---@type pi.Config
M.defaults = {
  auto_start = true,
  win = {
    layout = 'auto',
    width_threshold = 150,
    width = 80,
    height = 20,
    focus_source_on_stopinsert = true,
    keys = {
      close = { '<C-q>', mode = 'n', desc = 'Close Pi' },
      stopinsert = { '<C-q>', mode = 't', desc = 'Exit terminal mode' },
      suspend = { '<C-z>', mode = 't', desc = 'Suspend Neovim' },
      picker = { '<C-Space>', mode = 't', desc = 'Open context picker' },
    },
  },
}

---@type pi.Config
M.current = vim.deepcopy(M.defaults)

---@param opts? pi.Config
function M.setup(opts)
  if opts then
    M.current = vim.tbl_deep_extend('force', M.current, opts)
  end
end

--- Get current config
---@return pi.Config
function M.get()
  return M.current
end

return M
