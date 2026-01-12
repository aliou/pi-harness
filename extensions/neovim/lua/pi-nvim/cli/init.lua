local M = {}

local config = require('pi-nvim.config')
local terminal = require('pi-nvim.cli.terminal')
local source = require('pi-nvim.actions.source')
local watch = require('pi-nvim.cli.watch')

--- Get plugin root directory (where lua/ lives)
---@return string
local function get_plugin_root()
  local src = debug.getinfo(1, 'S').source:sub(2) -- Remove leading @
  -- src is: /path/to/extensions/neovim/lua/pi-nvim/cli/init.lua
  -- We want: /path/to/extensions/neovim
  return vim.fn.fnamemodify(src, ':h:h:h:h')
end

--- Build Pi command with extension
---@return string[]
function M.build_cmd()
  local cfg = config.get()
  local root = get_plugin_root()

  local cmd = { 'pi' }

  -- Load the nvim integration extension
  table.insert(cmd, '--extension')
  table.insert(cmd, root)

  -- Optional CLI flags from config
  if cfg.models then
    table.insert(cmd, '--models')
    table.insert(cmd, cfg.models)
  end
  if cfg.provider then
    table.insert(cmd, '--provider')
    table.insert(cmd, cfg.provider)
  end
  if cfg.model then
    table.insert(cmd, '--model')
    table.insert(cmd, cfg.model)
  end
  if cfg.thinking then
    table.insert(cmd, '--thinking')
    table.insert(cmd, cfg.thinking)
  end

  -- Extra args passthrough
  if cfg.extra_args then
    for _, arg in ipairs(cfg.extra_args) do
      table.insert(cmd, arg)
    end
  end

  return cmd
end

--- Open Pi terminal
function M.open()
  -- Check if Pi is installed
  if vim.fn.executable('pi') ~= 1 then
    vim.notify('[pi-nvim] pi command not found', vim.log.levels.ERROR)
    return
  end

  local term = terminal.get_current()
  if term then
    if not terminal.is_open(term) then
      terminal.show(term)
    else
      terminal.focus(term)
    end
    return
  end

  -- Save current window as source before opening terminal
  source.save()

  terminal.create(M.build_cmd())
  watch.enable()
end

--- Close Pi terminal (kills process)
function M.close()
  local term = terminal.get_current()
  if term then
    terminal.close(term)
    watch.disable()
  end
end

--- Toggle Pi terminal
function M.toggle()
  local term = terminal.get_current()
  if term and terminal.is_open(term) then
    M.close()
  else
    M.open()
  end
end

--- Check if Pi terminal is open
---@return boolean
function M.is_open()
  local term = terminal.get_current()
  return term ~= nil and terminal.is_open(term)
end

return M
