local M = {}

local source = require('pi-nvim.actions.source')

---@param node userdata
---@param bufnr number
---@return string
local function get_node_name(node, bufnr)
  local ok, field = pcall(node.field, node, 'name')
  if ok and field and field[1] then
    return vim.treesitter.get_node_text(field[1], bufnr)
  end

  -- Best-effort fallback: look for a first identifier-like child.
  for child in node:iter_children() do
    local t = child:type()
    if t == 'identifier' or t == 'name' then
      return vim.treesitter.get_node_text(child, bufnr)
    end
  end

  return node:type()
end

---@param node_type string
---@return "function"|"method"|"class"|"module"
local function classify_node(node_type)
  if node_type:find('class') then
    return 'class'
  end
  if node_type:find('method') then
    return 'method'
  end
  if node_type:find('module') then
    return 'module'
  end
  return 'function'
end

---@class pi.CurrentFunction
---@field name string
---@field type "function"|"method"|"class"|"module"
---@field start_line number
---@field end_line number

---@return pi.CurrentFunction?
function M.execute()
  local winnr = source.get_win()
  if not winnr then
    return nil
  end
  local bufnr = vim.api.nvim_win_get_buf(winnr)
  local cursor = vim.api.nvim_win_get_cursor(winnr)

  -- Get treesitter node at cursor position in source buffer
  local ok, node = pcall(vim.treesitter.get_node, {
    bufnr = bufnr,
    pos = { cursor[1] - 1, cursor[2] },
  })
  if not ok or not node then
    return nil
  end

  local target_types = {
    'function_declaration',
    'function_definition',
    'method_definition',
    'function',
    'arrow_function',
    'class_declaration',
    'class_definition',
  }

  while node do
    local node_type = node:type()
    if vim.tbl_contains(target_types, node_type) then
      local start_row, _, end_row, _ = node:range()
      return {
        name = get_node_name(node, bufnr),
        type = classify_node(node_type),
        start_line = start_row + 1,
        end_line = end_row + 1,
      }
    end

    node = node:parent()
  end

  return nil
end

return M
