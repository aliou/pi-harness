--- Source window tracking for actions
--- Ensures actions return context from source buffers, not the terminal
--- Uses timestamp-based tracking (inspired by sidekick.nvim)
local M = {}

--- Check if a window is a valid source (not terminal, not float)
---@param win number
---@return boolean
local function is_source_win(win)
  if not vim.api.nvim_win_is_valid(win) then
    return false
  end
  local buf = vim.api.nvim_win_get_buf(win)
  local ft = vim.bo[buf].filetype
  local bt = vim.bo[buf].buftype
  -- Exclude terminal buffers and floating windows
  if ft == 'pi_nvim' or bt == 'terminal' then
    return false
  end
  if vim.api.nvim_win_get_config(win).relative ~= '' then
    return false
  end
  return true
end

--- Mark window with current timestamp
---@param win number
local function mark_visit(win)
  vim.w[win].pi_nvim_visit = vim.uv.hrtime()
end

--- Setup autocmd to track source windows
function M.setup()
  local group = vim.api.nvim_create_augroup('pi_nvim_source', { clear = true })
  vim.api.nvim_create_autocmd('WinEnter', {
    group = group,
    callback = function()
      local win = vim.api.nvim_get_current_win()
      if is_source_win(win) then
        mark_visit(win)
      end
    end,
  })
end

--- Save current window as source (call before opening terminal)
function M.save()
  local win = vim.api.nvim_get_current_win()
  if is_source_win(win) then
    mark_visit(win)
  end
end

--- Get the source window (most recently visited non-terminal window)
---@return number|nil
function M.get_win()
  -- Get all valid source windows
  local wins = vim.tbl_filter(is_source_win, vim.api.nvim_list_wins())

  if #wins == 0 then
    return nil
  end

  -- Sort by visit timestamp (most recent first)
  table.sort(wins, function(a, b)
    return (vim.w[a].pi_nvim_visit or 0) > (vim.w[b].pi_nvim_visit or 0)
  end)

  return wins[1]
end

--- Get the source buffer
---@return number|nil
function M.get_buf()
  local win = M.get_win()
  if win then
    return vim.api.nvim_win_get_buf(win)
  end
  return nil
end

-- Auto-setup on require
M.setup()

return M
