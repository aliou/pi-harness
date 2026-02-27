local M = {}

---@alias pi.Action "context" | "diagnostics" | "current_function" | "splits" | "notify"

--- Dispatch an action query from Pi
--- Actions can be strings (simple queries) or tables (with parameters)
---@param action pi.Action|string|table
---@return any? result
---@return string? error
function M.dispatch(action)
  -- Handlers that take no parameters
  local simple_handlers = {
    context = require('pi-nvim.actions.context'),
    diagnostics = require('pi-nvim.actions.diagnostics'),
    current_function = require('pi-nvim.actions.current_function'),
    splits = require('pi-nvim.actions.splits'),
  }

  -- Handlers that take parameters (action is a table with { type, ... })
  local param_handlers = {
    diagnostics_for_files = require('pi-nvim.actions.diagnostics_for_files'),
    notify = require('pi-nvim.actions.notify'),
    reload = require('pi-nvim.actions.reload'),
  }

  -- Handle simple string actions
  if type(action) == 'string' then
    local handler = simple_handlers[action]
    if not handler then
      return nil, 'Unknown action: ' .. tostring(action)
    end
    local ok, result = pcall(handler.execute)
    if not ok then
      return nil, tostring(result)
    end
    return result
  end

  -- Handle parameterized actions (tables)
  if type(action) == 'table' and action.type then
    local handler = param_handlers[action.type]
    if not handler then
      return nil, 'Unknown action type: ' .. tostring(action.type)
    end
    local ok, result = pcall(handler.execute, action)
    if not ok then
      return nil, tostring(result)
    end
    return result
  end

  return nil, 'Invalid action format: ' .. vim.inspect(action)
end

return M
