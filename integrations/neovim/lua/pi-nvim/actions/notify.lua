--- Handle notifications from Pi
local M = {}

---@class pi.NotifyParams
---@field message string
---@field level? "info"|"warn"|"error"

---@param params pi.NotifyParams
---@return { success: boolean }
function M.execute(params)
  local levels = {
    info = vim.log.levels.INFO,
    warn = vim.log.levels.WARN,
    error = vim.log.levels.ERROR,
  }
  local level = levels[params.level or 'info'] or vim.log.levels.INFO
  vim.notify('[Pi] ' .. params.message, level)
  return { success = true }
end

return M
