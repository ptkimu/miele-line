#!/usr/bin/env bash
# preview/shell.html に src/ の実コードを埋め込んで、単体で動く1ファイルを生成する。
#
#   preview/index.html … ローカル確認用・共有用（依存ファイルなし）
#   out/index.html     … Netlify Drop などに置く配布物
#
# import / export を機械的に外して連結しているだけなので、
# src/ を直せば必ずここにも反映される（手で書き写す箇所はない）。

set -e
cd "$(dirname "$0")"

MODULES="src/salon.js src/line.js src/replies.js src/handlers.js src/tags.js src/quota.js src/scenarios.js src/delivery.js src/segments.js src/insights.js src/admin.js"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

for f in $MODULES; do
  echo "/* ---------- $f ---------- */"
  sed -E '/^import .*from .*;$/d; s/^export //' "$f"
  echo
done > "$TMP"

awk -v file="$TMP" '
  /\/\*__MODULES__\*\// { while ((getline line < file) > 0) print line; next }
  { print }
' preview/shell.html > preview/index.html

mkdir -p out
cp preview/index.html out/index.html
printf 'User-agent: *\nDisallow: /\n' > out/robots.txt

echo "built: preview/index.html, out/index.html, out/robots.txt"

# 説明書（オーナー・スタッフ向け）。モジュールを埋め込む必要はないのでそのまま配置する
cp preview/guide.html out/guide.html
echo "built: out/guide.html"
