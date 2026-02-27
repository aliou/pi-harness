local M = {}

local config = require('pi-nvim.config')
local rpc = require('pi-nvim.rpc')
local cli = require('pi-nvim.cli')

---@param opts? pi.Config
function M.setup(opts)
  config.setup(opts)

  local group = vim.api.nvim_create_augroup('pi_nvim', { clear = true })

  vim.api.nvim_create_autocmd('VimLeavePre', {
    group = group,
    callback = function()
      cli.close()
      rpc.stop()
    end,
  })

  vim.api.nvim_create_user_command('PiNvimStatus', function()
    local s = rpc.status()
    local t = cli.is_open() and 'open' or 'closed'
    vim.notify(string.format('RPC: %s\nTerminal: %s', vim.inspect(s), t), vim.log.levels.INFO)
  end, { desc = 'Show Pi-Nvim status' })

  if config.get().auto_start then
    local ok, err = rpc.start()
    if not ok then
      vim.notify('[pi-nvim] RPC start failed: ' .. tostring(err), vim.log.levels.WARN)
    end
  end
end

-- Query function for RPC calls (called via nvim --remote-expr)
function M.query(action)
  return require('pi-nvim.actions').dispatch(action)
end

-- RPC functions
M.start = rpc.start
M.stop = rpc.stop
M.status = rpc.status

-- CLI functions
M.open = cli.open
M.close = cli.close
M.toggle = cli.toggle
M.is_open = cli.is_open

return M
