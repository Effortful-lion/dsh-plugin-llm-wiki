#!/usr/bin/env bash
# 两条构建：宿主半（node ESM）+ 前端半（浏览器 CJS → 闭包工厂）。
#
# esbuild 解析顺序：$ESBUILD → PATH 里的 esbuild → 已知的本地安装位置。
# 任何一处命中就够，不再硬编码单一机器路径。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

find_esbuild() {
  if [ -n "${ESBUILD:-}" ]; then
    printf '%s' "$ESBUILD"
    return 0
  fi
  if command -v esbuild >/dev/null 2>&1; then
    command -v esbuild
    return 0
  fi
  local candidate
  for candidate in \
    "$ROOT/node_modules/.bin/esbuild" \
    "$ROOT/../node_modules/.bin/esbuild" \
    /Applications/DeepSeek\ Harness.app/Contents/Resources/app.asar.unpacked/dsh/node_modules/.bin/esbuild
  do
    if [ -x "$candidate" ]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

if ! ESBUILD_BIN="$(find_esbuild)"; then
  echo "找不到 esbuild：npm i（会装上 devDependencies 里的 esbuild），或设 ESBUILD=/path/to/esbuild" >&2
  exit 1
fi

cd "$ROOT"
mkdir -p lib .tmp

"$ESBUILD_BIN" host/index.ts \
  --bundle --platform=node --format=esm --target=node22 \
  '--external:@deepseek-ai/*' \
  --outfile=lib/index.js

"$ESBUILD_BIN" client/index.ts \
  --bundle --platform=browser --format=cjs --target=es2022 \
  --jsx=automatic \
  '--external:react' '--external:react/jsx-runtime' \
  --outfile=.tmp/client.body.js

node scripts/wrap-client.mjs .tmp/client.body.js lib/client.js dsh-plugin-llm-wiki

echo "宿主半 lib/index.js $(wc -c < lib/index.js) B"
echo "前端半 lib/client.js $(wc -c < lib/client.js) B"
