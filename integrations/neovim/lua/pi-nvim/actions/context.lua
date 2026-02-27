local M = {}

local source = require('pi-nvim.actions.source')

---@class pi.ContextSelection
---@field start { line: number, col: number }
---@field end { line: number, col: number }

---@class pi.Context
---@field file string
---@field cursor { line: number, col: number }
---@field selection? pi.ContextSelection
---@field filetype string
---@field modified boolean

---@param bufnr number
---@param mode string
---@return pi.ContextSelection?
---@diagnostic disable-next-line: unused-local
function M.get_visual_selection(bufnr, mode)
  local start = vim.fn.getpos("'<")
  local finish = vim.fn.getpos("'>")

  if start[2] == 0 or finish[2] == 0 then
    return nil
  end

  -- getregion() deals with linewise/charwise/blockwise selections.
  local lines = vim.fn.getregion(start, finish, { type = mode })

  return {
    start = { line = start[2], col = start[3] },
    ['end'] = { line = finish[2], col = finish[3] },
    text = table.concat(lines, '\n'),
  }
end

---@return pi.Context?
function M.execute()
  local winnr = source.get_win()
  if not winnr then
    return nil
  end
  local bufnr = vim.api.nvim_win_get_buf(winnr)
  local cursor = vim.api.nvim_win_get_cursor(winnr)

  ---@type pi.Context
  local result = {
    file = vim.api.nvim_buf_get_name(bufnr),
    cursor = { line = cursor[1], col = cursor[2] + 1 },
    filetype = vim.bo[bufnr].filetype,
    modified = vim.bo[bufnr].modified,
  }

  local mode = vim.api.nvim_get_mode().mode
  if mode == 'v' or mode == 'V' or mode == '\22' then
    result.selection = M.get_visual_selection(bufnr, mode)
  end

  return result
end

return M
