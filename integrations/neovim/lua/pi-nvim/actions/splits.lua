local M = {}

local source = require('pi-nvim.actions.source')

-- Buffer types to exclude from splits
local buftype_denylist = {
  terminal = true,
  help = true,
  quickfix = true,
  nofile = true,
  prompt = true,
}

---@class pi.VisibleRange
---@field first number
---@field last number

---@class pi.SplitInfo
---@field file string
---@field filetype string
---@field visible_range pi.VisibleRange
---@field cursor? { line: number, col: number }
---@field is_focused boolean
---@field modified boolean

--- Check if a window should be included in splits
---@param win number
---@return boolean
local function is_valid_split(win)
  if not vim.api.nvim_win_is_valid(win) then
    return false
  end
  local buf = vim.api.nvim_win_get_buf(win)
  local ft = vim.bo[buf].filetype
  local bt = vim.bo[buf].buftype
  -- Exclude Pi terminal, denylisted buffer types, and floating windows
  if ft == 'pi_nvim' or buftype_denylist[bt] then
    return false
  end
  if vim.api.nvim_win_get_config(win).relative ~= '' then
    return false
  end
  return true
end

---@return pi.SplitInfo[]
function M.execute()
  local source_win = source.get_win()
  local wins = vim.tbl_filter(is_valid_split, vim.api.nvim_list_wins())

  ---@type pi.SplitInfo[]
  local result = {}
  for _, win in ipairs(wins) do
    local buf = vim.api.nvim_win_get_buf(win)
    local is_focused = win == source_win

    ---@type pi.SplitInfo
    local info = {
      file = vim.api.nvim_buf_get_name(buf),
      filetype = vim.bo[buf].filetype,
      visible_range = {
        first = vim.fn.line('w0', win),
        last = vim.fn.line('w$', win),
      },
      is_focused = is_focused,
      modified = vim.bo[buf].modified,
    }

    if is_focused then
      local cursor = vim.api.nvim_win_get_cursor(win)
      info.cursor = { line = cursor[1], col = cursor[2] + 1 }
    end

    table.insert(result, info)
  end

  return result
end

return M
