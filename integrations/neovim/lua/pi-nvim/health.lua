local M = {}

function M.check()
  local health = vim.health or require('health')
  health.start('pi-nvim')

  -- Neovim version
  if vim.fn.has('nvim-0.10') ~= 1 then
    health.warn('Neovim >= 0.10 recommended (vim.uv, modern APIs)')
  else
    health.ok('Neovim version OK')
  end

  -- Pi CLI
  if vim.fn.executable('pi') == 1 then
    health.ok('pi command found')
  else
    health.warn('pi command not found (terminal features disabled)')
  end

  -- Module loading
  local ok, pi = pcall(require, 'pi-nvim')
  if not ok then
    health.error('Failed to load pi-nvim module')
    return
  end

  -- RPC status
  local status = pi.status()
  if status.running then
    health.ok('RPC server running')
  else
    health.warn("RPC server not running (did you call require('pi-nvim').setup()?)")
  end

  if status.socket then
    health.info('Socket: ' .. status.socket)
  end

  if status.lockfile then
    health.info('Lockfile: ' .. status.lockfile)
  end

  -- Terminal status
  if pi.is_open() then
    health.info('Terminal: open')
  else
    health.info('Terminal: closed')
  end
end

return M
