local M = {}

---@class pi.rpc.State
---@field socket? string Socket path
---@field cwd? string Working directory
---@field pid? number Process ID
---@field lockfile? string Lockfile path

---@type pi.rpc.State
local state = {}

---@param updates pi.rpc.State
function M.set(updates)
  state = vim.tbl_extend('force', state, updates)
end

---@return pi.rpc.State
function M.get()
  return state
end

function M.clear()
  state = {}
end

return M
