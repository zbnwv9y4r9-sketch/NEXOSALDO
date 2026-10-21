#!/bin/sh
# Ensambla NexoSaldo desde src/:
#   dist/nexosaldo.html  -> página para publicar como Artifact en Claude
#   ../site/             -> sitio independiente para GitHub Pages
set -e
cd "$(dirname "$0")"
SRC="src/finance.js src/pdf.js src/core.js src/ui.js src/views1.js src/views2.js src/views3.js src/main.js"
mkdir -p dist ../site
cat $SRC | grep -v '^if (typeof module' > dist/app.js
{ cat src/head.html; echo '<div id="app"></div><div id="modal" hidden></div><script>'; cat dist/app.js; echo '</script>'; } > dist/nexosaldo.html
python3 - <<'PY'
t = open("standalone/index.template.html").read()
t = t.replace("<!--HEAD-->", open("src/head.html").read()).replace("<!--APP-->", open("dist/app.js").read())
open("../site/index.html", "w").write(t)
PY
cp standalone/host.js standalone/manifest.webmanifest standalone/icon.svg standalone/apple-touch-icon.png standalone/icon-192.png standalone/icon-512.png ../site/
[ -f ../site/config.js ] || cp standalone/config.example.js ../site/config.js
cp standalone/config.example.js ../site/config.example.js
touch ../site/.nojekyll
rm dist/app.js
echo "OK: dist/nexosaldo.html y ../site/"
