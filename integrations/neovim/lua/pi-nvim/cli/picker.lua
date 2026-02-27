local M = {}

local terminal = require('pi-nvim.cli.terminal')
local actions = require('pi-nvim.actions')
local source = require('pi-nvim.actions.source')

--- Make path relative to cwd
---@param path string
---@return string
local function make_relative(path)
  if path == '' then
    return path
  end
  return vim.fn.fnamemodify(path, ':.')
end

--- Format action result as string for terminal
---@param name string
---@param result any
---@param source_buf number
---@return string?
local function format_result(name, result, source_buf)
  if not result then
    return nil
  end

  if name == 'context' then
    if result.file and result.file ~= '' then
      local rel = make_relative(result.file)
      return string.format('@%s:%d:%d', rel, result.cursor.line, result.cursor.col)
    end
  elseif name == 'diagnostics' then
    if #result == 0 then
      return nil
    end
    local lines = {}
    local file = make_relative(vim.api.nvim_buf_get_name(source_buf))
    for _, d in ipairs(result) do
      table.insert(lines, string.format('@%s:%d: [%s] %s', file, d.line, d.severity, d.message))
    end
    return table.concat(lines, '\n')
  elseif name == 'current_function' then
    if result.name then
      return string.format(
        '%s %s (lines %d-%d)',
        result.type,
        result.name,
        result.start_line,
        result.end_line
      )
    end
  end

  return nil
end

--- Show context picker
---@param term pi.Terminal
function M.show(term)
  -- Capture context from source window
  local source_win = source.get_win()
  if not source_win then
    vim.notify('[pi-nvim] No source window available', vim.log.levels.WARN)
    return
  end
  local source_buf = source.get_buf()

  -- Temporarily switch to source window for actions
  local current_win = vim.api.nvim_get_current_win()
  vim.api.nvim_set_current_win(source_win)

  local items = {}
  local action_names = { 'context', 'diagnostics', 'current_function' }

  for _, name in ipairs(action_names) do
    local result = actions.dispatch(name)
    local formatted = format_result(name, result, source_buf)
    if formatted then
      local preview = formatted:gsub('\n', ' '):sub(1, 50)
      if #formatted > 50 then
        preview = preview .. '...'
      end
      table.insert(items, { name = name, value = formatted, preview = preview })
    end
  end

  -- Add file path as simple option (relative to cwd)
  local file = make_relative(vim.api.nvim_buf_get_name(source_buf))
  if file ~= '' then
    table.insert(items, 1, { name = 'file', value = '@' .. file, preview = '@' .. file })
  end

  -- Restore window
  vim.api.nvim_set_current_win(current_win)

  if #items == 0 then
    vim.notify('[pi-nvim] No context available', vim.log.levels.WARN)
    return
  end

  vim.ui.select(items, {
    prompt = 'Send to Pi:',
    format_item = function(item)
      return string.format('[%s] %s', item.name, item.preview)
    end,
  }, function(choice)
    if choice then
      terminal.send(term, choice.value)
    end
    vim.schedule(function()
      terminal.focus(term)
    end)
  end)
end

return M
