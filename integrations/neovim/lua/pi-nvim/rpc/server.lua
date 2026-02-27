local M = {}

local state = require('pi-nvim.rpc.state')

local running = false
local MAX_LOG_SIZE = 100 * 1024 -- 100KB

---@param log_path string
local function truncate_log_if_needed(log_path)
  local stat = vim.uv.fs_stat(log_path)
  if stat and stat.size > MAX_LOG_SIZE then
    -- Truncate by keeping last half of file
    local f = io.open(log_path, 'r')
    if f then
      f:seek('set', stat.size - MAX_LOG_SIZE / 2)
      f:read('*l') -- Skip partial line
      local content = f:read('*a')
      f:close()
      f = io.open(log_path, 'w')
      if f then
        f:write('... (truncated)\n')
        f:write(content)
        f:close()
      end
    end
  end
end

---@param socket_path string
---@return boolean success
---@return string? error
function M.start(socket_path)
  vim.fn.delete(socket_path)

  local ok, err = pcall(vim.fn.serverstart, socket_path)
  if not ok then
    local log_dir = vim.fn.stdpath('log') .. '/pi-nvim'
    vim.fn.mkdir(log_dir, 'p')
    local log_path = log_dir .. '/rpc.log'
    truncate_log_if_needed(log_path)
    local log_file = io.open(log_path, 'a')
    if log_file then
      log_file:write(os.date('%Y-%m-%d %H:%M:%S') .. ' [ERROR] Failed to start RPC server\n')
      log_file:write(tostring(err) .. '\n\n')
      log_file:close()
    end
    return false, 'Failed to start RPC server (see ' .. log_path .. ')'
  end

  -- No global needed - query is exported from module

  state.set({ socket = socket_path })
  running = true
  return true
end

function M.stop()
  local s = state.get()
  if s.socket then
    pcall(vim.fn.serverstop, s.socket)
    vim.fn.delete(s.socket)
  end

  running = false
end

---@return boolean
function M.is_running()
  return running
end

return M
