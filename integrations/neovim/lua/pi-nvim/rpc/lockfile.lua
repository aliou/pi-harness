local M = {}

local config = require('pi-nvim.config')
local state = require('pi-nvim.rpc.state')

---@return string
function M.get_data_dir()
  local cfg = config.get()
  if cfg.data_dir then
    return cfg.data_dir
  end
  return vim.fn.stdpath('data') .. '/pi-nvim'
end

---@param cwd string
---@return string
function M.cwd_hash(cwd)
  return vim.fn.sha256(cwd):sub(1, 8)
end

---@param cwd string
---@param pid number
---@return string
function M.get_socket_path(cwd, pid)
  local dir = M.get_data_dir()
  local hash = M.cwd_hash(cwd)
  return string.format('%s/%s-%d.sock', dir, hash, pid)
end

---@param cwd string
---@param pid number
---@return string
function M.get_lockfile_path(cwd, pid)
  local dir = M.get_data_dir()
  local hash = M.cwd_hash(cwd)
  return string.format('%s/%s-%d.json', dir, hash, pid)
end

---@param socket_path string
---@param cwd string
---@param pid number
---@return boolean success
---@return string? error
function M.create(socket_path, cwd, pid)
  local dir = M.get_data_dir()
  vim.fn.mkdir(dir, 'p')

  local lockfile_path = M.get_lockfile_path(cwd, pid)
  local data = vim.json.encode({
    socket = socket_path,
    cwd = cwd,
    pid = pid,
  })

  local ok = pcall(function()
    local f = io.open(lockfile_path, 'w')
    if f then
      f:write(data)
      f:close()
    end
  end)

  if not ok then
    return false, 'Failed to write lockfile'
  end

  state.set({ lockfile = lockfile_path })
  return true
end

---@param cwd string
---@param pid number
function M.remove(cwd, pid)
  local lockfile_path = M.get_lockfile_path(cwd, pid)
  local socket_path = M.get_socket_path(cwd, pid)
  vim.fn.delete(lockfile_path)
  vim.fn.delete(socket_path)
end

return M
