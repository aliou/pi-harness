local M = {}

local config = require('pi-nvim.config')

vim.api.nvim_set_hl(0, 'PiNvimNormal', { link = 'Normal', default = true })

---@class pi.Terminal
---@field buf number|nil Buffer number
---@field win number|nil Window number
---@field job number|nil Job ID

---@type pi.Terminal|nil
local current_terminal = nil

-- Track if we were in terminal insert mode before suspend
local restore_insert_on_resume = false

---@return pi.Terminal|nil
function M.get_current()
  return current_terminal
end

---@return string
local function get_layout()
  local cfg = config.get()
  local layout = cfg.win.layout
  if layout == 'auto' then
    return vim.o.columns >= cfg.win.width_threshold and 'right' or 'bottom'
  end
  return layout
end

---@param buf number
---@return number
local function open_win(buf)
  local cfg = config.get()
  local layout = get_layout()
  local opts = { win = -1, style = 'minimal' }

  if layout == 'right' then
    opts.split = 'right'
    opts.width = cfg.win.width
  elseif layout == 'left' then
    opts.split = 'left'
    opts.width = cfg.win.width
  elseif layout == 'bottom' then
    opts.split = 'below'
    opts.height = cfg.win.height
  elseif layout == 'top' then
    opts.split = 'above'
    opts.height = cfg.win.height
  elseif layout == 'float' then
    opts.relative = 'editor'
    opts.width = math.floor(vim.o.columns * 0.9)
    opts.height = math.floor(vim.o.lines * 0.9)
    opts.row = math.floor(vim.o.lines * 0.05)
    opts.col = math.floor(vim.o.columns * 0.05)
  end

  return vim.api.nvim_open_win(buf, true, opts)
end

---@param win number
local function set_win_options(win)
  local wo = {
    winhighlight = 'Normal:PiNvimNormal,NormalNC:PiNvimNormal,EndOfBuffer:PiNvimNormal,SignColumn:PiNvimNormal',
    number = false,
    relativenumber = false,
    signcolumn = 'no',
    spell = false,
    wrap = false,
    sidescrolloff = 0,
  }
  for k, v in pairs(wo) do
    vim.api.nvim_set_option_value(k, v, { win = win })
  end
  vim.wo[win].winfixwidth = true
end

---@param terminal pi.Terminal
local function setup_keymaps(terminal)
  if not terminal.buf then
    return
  end

  local cfg = config.get()
  local keys = cfg.win.keys

  if keys.close then
    local map = keys.close
    vim.keymap.set(map.mode or 'n', map[1], function()
      M.close(terminal)
    end, { buffer = terminal.buf, desc = map.desc })
  end

  if keys.stopinsert then
    local map = keys.stopinsert
    vim.keymap.set(map.mode or 't', map[1], function()
      vim.cmd.stopinsert()
      if cfg.win.focus_source_on_stopinsert then
        local source = require('pi-nvim.actions.source')
        local win = source.get_win()
        if win and vim.api.nvim_win_is_valid(win) then
          vim.api.nvim_set_current_win(win)
        end
      end
    end, { buffer = terminal.buf, desc = map.desc })
  end

  if keys.suspend then
    local map = keys.suspend
    vim.keymap.set(map.mode or 't', map[1], function()
      -- Remember we were in terminal insert mode
      restore_insert_on_resume = true
      -- Exit terminal mode and let Neovim handle suspend
      vim.cmd.stopinsert()
      vim.cmd.suspend()
    end, { buffer = terminal.buf, desc = map.desc })
  end

  if keys.picker then
    local map = keys.picker
    vim.keymap.set(map.mode or 't', map[1], function()
      require('pi-nvim.cli.picker').show(terminal)
    end, { buffer = terminal.buf, desc = map.desc })
  end
end

---@param cmd string[]
---@return pi.Terminal
function M.create(cmd)
  if current_terminal then
    M.close(current_terminal)
  end

  local buf = vim.api.nvim_create_buf(false, true)
  vim.bo[buf].filetype = 'pi_nvim'
  vim.bo[buf].swapfile = false

  ---@type pi.Terminal
  local terminal = { buf = buf }
  current_terminal = terminal

  setup_keymaps(terminal)

  local win = open_win(buf)
  terminal.win = win
  set_win_options(win)

  vim.api.nvim_win_call(win, function()
    local env = vim.tbl_extend('force', {}, vim.uv.os_environ(), {
      NVIM = vim.v.servername,
      NVIM_LISTEN_ADDRESS = false,
      TERM = 'xterm-256color',
    })
    for k, v in pairs(env) do
      if v == false then
        env[k] = nil
      end
    end

    terminal.job = vim.fn.jobstart(cmd, {
      term = true,
      clear_env = true,
      env = next(env) and env or nil,
      on_exit = function()
        vim.schedule(function()
          if current_terminal == terminal then
            M.close(terminal)
          end
        end)
      end,
    })

    if terminal.job <= 0 then
      vim.schedule(function()
        M.close(terminal)
        vim.notify('[pi-nvim] Failed to start Pi process', vim.log.levels.ERROR)
      end)
      return
    end
  end)

  vim.api.nvim_set_current_win(win)
  vim.cmd.startinsert()

  vim.api.nvim_create_autocmd('TermClose', {
    buffer = buf,
    callback = function()
      vim.schedule(function()
        M.close(terminal)
      end)
    end,
  })

  vim.api.nvim_create_autocmd('VimResume', {
    buffer = buf,
    callback = function()
      if restore_insert_on_resume then
        restore_insert_on_resume = false
        -- Only restore if terminal is still open and focused
        if M.is_open(terminal) and vim.api.nvim_get_current_buf() == buf then
          vim.cmd.startinsert()
        end
      end
    end,
  })

  vim.api.nvim_create_autocmd('BufEnter', {
    buffer = buf,
    callback = function()
      vim.cmd.startinsert()
    end,
  })

  return terminal
end

---@param terminal pi.Terminal
function M.show(terminal)
  if not terminal.buf or not vim.api.nvim_buf_is_valid(terminal.buf) then
    return
  end
  if terminal.win and vim.api.nvim_win_is_valid(terminal.win) then
    vim.api.nvim_set_current_win(terminal.win)
  else
    terminal.win = open_win(terminal.buf)
    set_win_options(terminal.win)
  end
  vim.cmd.startinsert()
end

---@param terminal pi.Terminal
function M.close(terminal)
  if terminal.win and vim.api.nvim_win_is_valid(terminal.win) then
    vim.api.nvim_win_close(terminal.win, true)
  end
  if terminal.job then
    vim.fn.jobstop(terminal.job)
  end
  if terminal.buf and vim.api.nvim_buf_is_valid(terminal.buf) then
    vim.api.nvim_buf_delete(terminal.buf, { force = true })
  end
  if current_terminal == terminal then
    current_terminal = nil
  end
end

---@param terminal pi.Terminal
---@return boolean
function M.is_open(terminal)
  return terminal.win and vim.api.nvim_win_is_valid(terminal.win) or false
end

---@param terminal pi.Terminal
function M.focus(terminal)
  if M.is_open(terminal) then
    vim.api.nvim_set_current_win(terminal.win)
    vim.cmd.startinsert()
  end
end

---@param terminal pi.Terminal
---@param text string
function M.send(terminal, text)
  if terminal.job then
    vim.api.nvim_chan_send(terminal.job, text)
  end
end

return M
