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
  -- Use "v" (visual start) and "." (cursor) for the active selection.
  -- The '< and '> marks only update after leaving visual mode, so they
  -- reflect the *previous* selection while visual mode is still active.
  local start = vim.fn.getpos("v")
  local finish = vim.fn.getpos(".")

  if start[2] == 0 or finish[2] == 0 then
    return nil
  end

  -- getregion() deals with linewise/charwise/blockwise selections
  -- and handles unordered positions (start after finish)
  local lines = vim.fn.getregion(start, finish, { type = mode })

  -- Normalize so start <= end for the returned range
  local s_line, s_col = start[2], start[3]
  local e_line, e_col = finish[2], finish[3]
  if s_line > e_line or (s_line == e_line and s_col > e_col) then
    s_line, s_col, e_line, e_col = e_line, e_col, s_line, s_col
  end

  return {
    start = { line = s_line, col = s_col },
    ['end'] = { line = e_line, col = e_col },
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
  local current_win = vim.api.nvim_get_current_win()
  if (mode == 'v' or mode == 'V' or mode == '\22') and winnr == current_win then
    result.selection = M.get_visual_selection(bufnr, mode)
  end

  return result
end

return M
