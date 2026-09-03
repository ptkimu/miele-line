#!/usr/bin/env bash
# src/ の実コードを1ファイルに固めて、ブラウザで動作テストを走らせる。
#
#   ./run-tests.sh tests/openslot.html
#
# Node が入っていない環境でも動くよう、ヘッドレスのChromeで開いて
# <pre id="TESTOUT"> を読み取る形にしている。
# 組み立てているだけなので、src/ を直せば必ずここにも反映される。

set -e
cd "$(dirname "$0")"

SRC="$1"
[ -n "$SRC" ] || { echo "使い方: ./run-tests.sh tests/＜ファイル＞.html" >&2; exit 2; }
[ -f "$SRC" ] || { echo "見つかりません: $SRC" >&2; exit 2; }

# index.js は Worker の入口（export default）なので混ぜない
MODULES="src/salon.js src/courses.js src/menu.js src/line.js src/replies.js src/handlers.js
         src/tags.js src/quota.js src/segments.js src/openslot.js src/story.js src/richmenu.js
         src/gcal.js src/liff.js src/api.js src/app.js src/social.js src/auto.js src/admin.js"

OUT="$(mktemp -u).html"

{
  printf '%s\n' '<!doctype html><meta charset="utf-8"><body>'
  # テストが置いている要素（iframe など）を先に写す。
  # 何も置いていないテストもあるので、script の手前で止める
  awk 'NR > 1 { if ($0 ~ /<script type="module">/) exit; print }' "$SRC"
  printf '%s\n' '<script>'
  for f in $MODULES; do
    printf '/* ---------- %s ---------- */\n' "$f"
    # import は1行のものと、複数行にまたがるものの両方を外す
    sed -E '/^import .*from .*;$/d' "$f" \
      | sed -E "/^import /,/^\} from '[^']*';$/d" \
      | sed -E 's/^export //'
    printf '\n'
  done
  # テスト本体。import 行だけ落として、そのまま流し込む
  printf '%s\n' '(async () => { try {'
  sed -n '/<script type="module">/,/<\/script>/p' "$SRC" \
    | sed -E '1d; $d' \
    | sed -E "/^import /,/from '[^']*';$/d"
  printf '%s\n' '} catch (e) {' \
    '  const p = document.createElement("pre"); p.id = "ERR";' \
    '  p.textContent = "ERROR " + (e && e.stack ? e.stack : e);' \
    '  document.body.appendChild(p);' \
    '} })();' '</script>'
} > "$OUT"

echo "$OUT"
