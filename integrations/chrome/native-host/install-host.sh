#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="dev.pi.chrome.bridge"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_PATH="${SCRIPT_DIR}/host.cjs"
OS_NAME="$(uname -s)"
PI_CHROME_DIR="$HOME/.pi/chrome"
LOG_DIR="$PI_CHROME_DIR/logs"
INSTALL_LOG="$LOG_DIR/native-host-install.log"

usage() {
  cat >&2 <<EOF
Usage: ./install-host.sh <extension-id> [--browser chrome|helium|all]

Examples:
  ./install-host.sh abcdefghijklmnopqrstuvwxzyabcdef --browser chrome
  ./install-host.sh abcdefghijklmnopqrstuvwxzyabcdef --browser helium
  ./install-host.sh abcdefghijklmnopqrstuvwxzyabcdef --browser all
EOF
}

if [ $# -lt 1 ]; then
  usage
  exit 1
fi

EXTENSION_ID="$1"
shift

if ! [[ "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
  echo "Invalid extension id format: $EXTENSION_ID" >&2
  echo "Expected 32 chars in range a-p." >&2
  exit 1
fi

BROWSER="all"
while [ $# -gt 0 ]; do
  case "$1" in
    --browser|-b)
      shift
      BROWSER="${1:-}"
      if [ -z "$BROWSER" ]; then
        echo "Missing value for --browser" >&2
        usage
        exit 1
      fi
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

mkdir -p "$LOG_DIR"

NODE_PATH="$(command -v node || true)"
if [ -z "$NODE_PATH" ]; then
  echo "Could not find node in PATH" >&2
  exit 1
fi

PI_BIN_PATH="$(command -v pi || true)"
if [ -z "$PI_BIN_PATH" ]; then
  echo "Could not find pi in PATH during install. continuing; host will fallback to 'pi'." >&2
fi

WRAPPER_PATH="$PI_CHROME_DIR/native-host-wrapper.sh"
mkdir -p "$PI_CHROME_DIR"
cat > "$WRAPPER_PATH" <<EOF
#!/usr/bin/env bash
export PI_BIN="${PI_BIN_PATH}"
exec "$NODE_PATH" "$HOST_PATH"
EOF
chmod +x "$WRAPPER_PATH"
chmod +x "$HOST_PATH"

{
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] install start"
  echo "extension_id=$EXTENSION_ID"
  echo "node_path=$NODE_PATH"
  echo "host_path=$HOST_PATH"
  echo "wrapper_path=$WRAPPER_PATH"
  echo "pi_bin_path=$PI_BIN_PATH"
  echo "os=$OS_NAME"
} >> "$INSTALL_LOG"

get_target_dir() {
  local browser="$1"

  if [ "$OS_NAME" = "Darwin" ]; then
    case "$browser" in
      chrome)
        echo "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
        return 0
        ;;
      helium)
        echo "$HOME/Library/Application Support/net.imput.helium/NativeMessagingHosts"
        return 0
        ;;
      *)
        return 1
        ;;
    esac
  elif [ "$OS_NAME" = "Linux" ]; then
    case "$browser" in
      chrome)
        echo "$HOME/.config/google-chrome/NativeMessagingHosts"
        return 0
        ;;
      helium)
        return 1
        ;;
      *)
        return 1
        ;;
    esac
  fi

  return 1
}

install_for_browser() {
  local browser="$1"
  local target_dir

  if ! target_dir="$(get_target_dir "$browser")"; then
    echo "Skipping $browser: unsupported on $OS_NAME" >&2
    return 0
  fi

  mkdir -p "$target_dir"
  local manifest_path="$target_dir/${HOST_NAME}.json"

  cat > "$manifest_path" <<EOF
{
  "name": "${HOST_NAME}",
  "description": "Pi Chrome Extension Bridge",
  "path": "${WRAPPER_PATH}",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXTENSION_ID}/"
  ]
}
EOF

  echo "Installed for ${browser}: ${manifest_path}"
  {
    echo "manifest_${browser}=$manifest_path"
    echo "manifest_content_start"
    cat "$manifest_path"
    echo "manifest_content_end"
  } >> "$INSTALL_LOG"
}

case "$BROWSER" in
  chrome)
    install_for_browser chrome
    ;;
  helium)
    install_for_browser helium
    ;;
  all)
    install_for_browser chrome
    install_for_browser helium
    ;;
  *)
    echo "Unsupported browser: $BROWSER (use chrome|helium|all)" >&2
    exit 1
    ;;
esac

echo "Install log: $INSTALL_LOG"
