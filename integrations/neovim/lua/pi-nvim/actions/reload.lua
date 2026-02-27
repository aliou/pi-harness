--- Handle file reload requests from Pi
local M = {}

---@class pi.ReloadParams
---@field type "reload"
---@field files string[]

---@class pi.ReloadResult
---@field reloaded string[]
---@field skipped string[]

--- Reload files that have open buffers (if not modified)
---@param params pi.ReloadParams
---@return pi.ReloadResult
function M.execute(params)
  local reloaded = {}
  local skipped = {}

  for _, file in ipairs(params.files or {}) do
    local bufnr = vim.fn.bufnr(file)

    -- Skip if no buffer exists for this file
    if bufnr == -1 then
      goto continue
    end

    -- Skip modified buffers
    if vim.bo[bufnr].modified then
      table.insert(skipped, file)
      goto continue
    end

    -- Reload the buffer
    vim.api.nvim_buf_call(bufnr, function()
      vim.cmd('e')
    end)
    table.insert(reloaded, file)

    ::continue::
  end

  return { reloaded = reloaded, skipped = skipped }
end

return M
