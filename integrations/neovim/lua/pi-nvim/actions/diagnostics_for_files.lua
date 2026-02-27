--- Get LSP errors for specific files
local M = {}

---@class pi.FileDiagnostic
---@field line number
---@field col number
---@field message string
---@field source? string

---@class pi.DiagnosticsForFilesParams
---@field type "diagnostics_for_files"
---@field files string[]

---@alias pi.DiagnosticsForFilesResult table<string, pi.FileDiagnostic[]>

--- Find buffer number for a file path
---@param path string
---@return number? bufnr
local function find_buffer(path)
  local bufnr = vim.fn.bufnr(path)
  if bufnr == -1 then
    return nil
  end
  -- Check if buffer is actually loaded
  if not vim.api.nvim_buf_is_loaded(bufnr) then
    return nil
  end
  return bufnr
end

--- Get active LSP client names for a buffer
---@param bufnr number
---@return table<string, boolean>
local function get_active_lsp_sources(bufnr)
  local sources = {}
  local clients = vim.lsp.get_clients({ bufnr = bufnr })
  for _, client in ipairs(clients) do
    sources[client.name] = true
  end
  return sources
end

--- Get ERROR diagnostics for a buffer, filtering stale LSP diagnostics
---@param bufnr number
---@return pi.FileDiagnostic[]
local function get_errors(bufnr)
  local active_sources = get_active_lsp_sources(bufnr)
  local diagnostics = vim.diagnostic.get(bufnr, {
    severity = vim.diagnostic.severity.ERROR,
  })

  ---@type pi.FileDiagnostic[]
  local result = {}
  for _, d in ipairs(diagnostics) do
    -- Keep diagnostic if:
    -- 1. No source (can't verify, assume valid)
    -- 2. Source matches an active LSP client
    if not d.source or active_sources[d.source] then
      table.insert(result, {
        line = d.lnum + 1,
        col = d.col + 1,
        message = d.message,
        source = d.source,
      })
    end
  end

  return result
end

---@param params pi.DiagnosticsForFilesParams
---@return pi.DiagnosticsForFilesResult
function M.execute(params)
  ---@type pi.DiagnosticsForFilesResult
  local result = {}

  for _, path in ipairs(params.files or {}) do
    local bufnr = find_buffer(path)
    if bufnr then
      local errors = get_errors(bufnr)
      if #errors > 0 then
        result[path] = errors
      end
    end
  end

  return result
end

return M
