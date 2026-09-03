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

MODULES="src/salon.js src/courses.js src/menu.js src/line.js src/replies.js src/handlers.js src/tags.js src/quota.js src/segments.js src/openslot.js src/story.js src/richmenu.js src/gcal.js src/liff.js src/api.js src/app.js src/social.js src/auto.js"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

for f in $MODULES; do
  echo "/* ---------- $f ---------- */"
  # import は1行のものと、複数行にまたがるものの両方を外す
  sed -E '/^import .*from .*;$/d' "$f" \
    | sed -E "/^import /,/^\} from '[^']*';$/d" \
    | sed -E 's/^export //'
  echo
done > "$TMP"

# 連結したときに同じ名前が二重に宣言されると、構文エラーで
# スクリプト全体が動かなくなる。静かに壊れないよう、ここで止める。
DUP="$(grep -oE '^(async )?(const|let|function) [A-Za-z_$][A-Za-z0-9_$]*' "$TMP" | awk '{print $NF}' | sort | uniq -d)"
if [ -n "$DUP" ]; then
  echo "ERROR: src/ の中で名前が重複しています: $DUP" >&2
  exit 1
fi

mkdir -p out
printf 'User-agent: *
Disallow: /
' > out/robots.txt
# 説明書（オーナー・スタッフ向け）。モジュールを埋め込む必要はないのでそのまま配置する
cp preview/guide.html out/guide.html
echo "built: out/guide.html"

# 空き枠のしくみ（お客様側とスタッフ側を1画面に。リッチメニュー画像も埋め込む）
B64="$(base64 -w0 design/richmenu.png)"

awk -v file="$TMP" '
  /\/\*__MODULES__\*\// { while ((getline line < file) > 0) print line; next }
  { print }
' preview/slot-shell.html > "$TMP.slot"
sed "s|/\*__RICHMENU_PNG__\*/|data:image/png;base64,${B64}|" "$TMP.slot" > preview/slot.html
rm -f "$TMP.slot"

mkdir -p out-slot
cp preview/slot.html out-slot/index.html
printf 'User-agent: *\nDisallow: /\n' > out-slot/robots.txt
echo "built: out-slot/index.html, out-slot/robots.txt"

# リッチメニューの設定手順（src のコードと画像を埋め込んだ単独ファイル）
awk -v file="$TMP" '
  /\/\*__MODULES__\*\// { while ((getline line < file) > 0) print line; next }
  { print }
' preview/richmenu-shell.html > "$TMP.rm"
sed "s|/\*__RICHMENU_PNG__\*/|data:image/png;base64,${B64}|" "$TMP.rm" > preview/richmenu.html
rm -f "$TMP.rm"
cp preview/richmenu.html out/richmenu.html
echo "built: out/richmenu.html"

# 生成したページの中でも、同じ名前が二重に宣言されていないか確かめる。
# src/ 側だけでなく、画面側のスクリプトとの衝突も拾う。
check_dupes() {
  local dup
  dup="$(awk '/^<script type="module">$/{f=1;next} /^<\/script>$/{f=0} f' "$1" \
    | grep -oE '^(async )?(const|let|function) [A-Za-z_$][A-Za-z0-9_$]*' \
    | awk '{print $NF}' | sort | uniq -d)"
  if [ -n "$dup" ]; then
    echo "ERROR: $1 で名前が重複しています: $dup" >&2
    exit 1
  fi
}

check_dupes preview/slot.html
check_dupes preview/richmenu.html
echo "checked: 名前の重複なし"

# リッチメニュー編集ページ（ボタンの文字と、空欄の店舗情報を編集できる）
awk -v file="$TMP" '
  /\/\*__MODULES__\*\// { while ((getline line < file) > 0) print line; next }
  { print }
' preview/menu-shell.html > preview/menu.html
cp preview/menu.html out/menu.html
check_dupes preview/menu.html
echo "built: out/menu.html"

# LINEの中で開くページ（コース診断・メニュー・問診表・アクセス・空き枠の設定）
awk -v file="$TMP" '
  /\/\*__MODULES__\*\// { while ((getline line < file) > 0) print line; next }
  { print }
' preview/app-shell.html > "$TMP.app"
sed "s|/\*__RICHMENU_PNG__\*/|data:image/png;base64,${B64}|" "$TMP.app" > preview/app.html
rm -f "$TMP.app"
cp preview/app.html out/app.html
check_dupes preview/app.html
echo "built: out/app.html"

# 空き枠が自動で出るまで（カレンダー→LINE→30分後にInstagram・Google）
awk -v file="$TMP" -v guide="preview/guide.html" '
  /\/\*__MODULES__\*\// { while ((getline line < file) > 0) print line; next }
  /\/\*__GUIDE__\*\//   { while ((getline l < guide) > 0) print l; next }
  { print }
' preview/auto-shell.html > preview/auto.html
cp preview/auto.html out/auto.html
check_dupes preview/auto.html
echo "built: out/auto.html"

# 空き枠のしくみ ＋ リッチメニュー編集 を1枚にした画面
EDCSS="$(awk '/\/\*EDITOR-CSS\*\//{f=1;next} /\/\*\/EDITOR-CSS\*\//{f=0} f' preview/menu-shell.html)"
EDSEC="$(awk '/<!--EDITOR-SECTIONS-->/{f=1;next} /<!--\/EDITOR-SECTIONS-->/{f=0} f' preview/menu-shell.html)"
EDJS="$(awk '/\/\*EDITOR-JS\*\//{f=1;next} /\/\*\/EDITOR-JS\*\//{f=0} f' preview/menu-shell.html)"

printf '%s\n' "$EDCSS" > "$TMP.css"
printf '%s\n' "$EDSEC" > "$TMP.sec"
printf '%s\n' "$EDJS"  > "$TMP.js"

awk -v css="$TMP.css" -v sec="$TMP.sec" -v js="$TMP.js" -v mod="$TMP" '
  /\/\*EDITOR-CSS-HERE\*\// { while ((getline l < css) > 0) print l; next }
  /<!--EDITOR-HERE-->/      { while ((getline l < sec) > 0) print l; next }
  /\/\*EDITOR-JS-HERE\*\//  { while ((getline l < js)  > 0) print l; next }
  /\/\*__MODULES__\*\//     { while ((getline l < mod) > 0) print l; next }
  { print }
' preview/slot-shell.html > "$TMP.all"

sed "s|/\*__RICHMENU_PNG__\*/|data:image/png;base64,${B64}|" "$TMP.all" > preview/all.html
rm -f "$TMP.css" "$TMP.sec" "$TMP.js" "$TMP.all"
cp preview/all.html out/all.html
cp preview/home.html out/index.html
check_dupes preview/all.html
echo "built: out/all.html"

# 配布用の軽いフォルダ。今日お見せするものだけを入れる。
# ページが多いと、どこを見ればよいか分からなくなるため。
mkdir -p drop
cp preview/drop-home.html drop/index.html
cp preview/auto.html      drop/auto.html
cp preview/app.html       drop/app.html
cp preview/guide.html     drop/guide.html
printf 'User-agent: *\nDisallow: /\n' > drop/robots.txt
echo "built: drop/（index・auto・app・guide）"
