local M = {}

local terminal = require('pi-nvim.cli.terminal')

local enabled = false
local timer = nil

function M.enable()
  if enabled then
    return
  end
  enabled = true

  timer = vim.uv.new_timer()
  timer:start(
    2000,
    2000,
    vim.schedule_wrap(function()
      local term = terminal.get_current()
      if term and terminal.is_open(term) then
        vim.cmd('checktime')
      end
    end)
  )
end

function M.disable()
  if not enabled then
    return
  end
  enabled = false

  if timer then
    timer:stop()
    timer:close()
    timer = nil
  end
end

return M
