local M = {}

local source = require('pi-nvim.actions.source')

---@class pi.Diagnostic
---@field line number
---@field col number
---@field message string
---@field severity "error"|"warning"|"info"|"hint"
---@field source? string

---@return pi.Diagnostic[]
function M.execute()
  local bufnr = source.get_buf()
  if not bufnr then
    return {}
  end
  local diagnostics = vim.diagnostic.get(bufnr)

  local severity_map = {
    [vim.diagnostic.severity.ERROR] = 'error',
    [vim.diagnostic.severity.WARN] = 'warning',
    [vim.diagnostic.severity.INFO] = 'info',
    [vim.diagnostic.severity.HINT] = 'hint',
  }

  ---@type pi.Diagnostic[]
  local result = {}
  for _, d in ipairs(diagnostics) do
    table.insert(result, {
      line = d.lnum + 1,
      col = d.col + 1,
      message = d.message,
      severity = severity_map[d.severity] or 'info',
      source = d.source,
    })
  end

  return result
end

return M
