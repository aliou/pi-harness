local M = {}

local server = require('pi-nvim.rpc.server')
local lockfile = require('pi-nvim.rpc.lockfile')
local state = require('pi-nvim.rpc.state')

---@return boolean success
---@return string? error
function M.start()
  if server.is_running() then
    return true
  end

  local cwd = vim.fn.getcwd()
  local pid = vim.fn.getpid()

  state.set({ cwd = cwd, pid = pid })

  -- Ensure data directory exists before creating socket
  local data_dir = lockfile.get_data_dir()
  vim.fn.mkdir(data_dir, 'p')

  local socket_path = lockfile.get_socket_path(cwd, pid)
  local ok, err = server.start(socket_path)
  if not ok then
    return false, err
  end

  local created, cerr = lockfile.create(socket_path, cwd, pid)
  if not created then
    server.stop()
    return false, cerr
  end

  return true
end

function M.stop()
  local s = state.get()
  if s.cwd and s.pid then
    lockfile.remove(s.cwd, s.pid)
  end
  server.stop()
  state.clear()
end

---@return boolean
function M.is_running()
  return server.is_running()
end

---@return { running: boolean, socket: string?, cwd: string?, pid: number?, lockfile: string? }
function M.status()
  local s = state.get()
  return {
    running = server.is_running(),
    socket = s.socket,
    cwd = s.cwd,
    pid = s.pid,
    lockfile = s.lockfile,
  }
end

return M
