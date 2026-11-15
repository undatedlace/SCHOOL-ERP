#!/usr/bin/env bash
#
# Builds the signed release APK that testers install (Android, 64-bit phones only).
#
#   mobile/scripts/build-apk.sh [API_URL] [VERSION_CODE]
#
#   API_URL       where the app talks to (default: the PPE API on Render, over https)
#   VERSION_CODE  a whole number that must go UP with every build you publish (default 1)
#
# The result is mobile/dist/school-erp.apk, and its SHA-256 is printed.
#
# SIGNING KEY. Android installs an update over an older version only if both were signed with
# the same key, so the key is made once and kept OUTSIDE the repository, in
# ~/.school-erp-keys (override with SCHOOL_ERP_KEYS). BACK THAT FOLDER UP: if it is lost, every
# tester has to uninstall the app before they can install the next version. Never commit it.
#
set -euo pipefail

cd "$(dirname "$0")/.."

API_URL="${1:-https://school-erp-api-ppe.onrender.com}"
VERSION_CODE="${2:-1}"
KEYS_DIR="${SCHOOL_ERP_KEYS:-$HOME/.school-erp-keys}"
PROPS="$KEYS_DIR/signing.properties"
KEYSTORE="$KEYS_DIR/school-erp-release.jks"

case "$API_URL" in
  https://*) ;;
  *) echo "API_URL must start with https:// for a build you share (got: $API_URL)" >&2; exit 1 ;;
esac

# 1. The signing key, made once.
if [ ! -f "$KEYSTORE" ]; then
  echo "Creating the signing key in $KEYS_DIR (do this once, then back the folder up)"
  mkdir -p "$KEYS_DIR"
  chmod 700 "$KEYS_DIR"
  PASS="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
  keytool -genkeypair -noprompt -keystore "$KEYSTORE" -alias school-erp \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" \
    -dname "CN=School ERP, O=School ERP, C=IN"
  {
    echo "storeFile=$KEYSTORE"
    echo "storePassword=$PASS"
    echo "keyAlias=school-erp"
    echo "keyPassword=$PASS"
  } > "$PROPS"
  chmod 600 "$PROPS" "$KEYSTORE"
fi

# 2. A clean native project, with the API address baked in.
EXPO_PUBLIC_API_URL="$API_URL" CI=1 npx expo prebuild --platform android --clean --no-install
git checkout -- package.json 2>/dev/null || true # prebuild rewrites the run scripts; keep ours

# 3. Sign with our key, 64-bit phones only (a much smaller file), and set the version code.
SIGNING_PROPS="$PROPS" VERSION_CODE="$VERSION_CODE" node -e '
const fs = require("fs");
let g = fs.readFileSync("android/app/build.gradle", "utf8");
g = g.replace(/versionCode \d+/, "versionCode " + process.env.VERSION_CODE);
g = g.replace("signingConfigs {", `signingConfigs {
        release {
            def p = new Properties()
            file("${process.env.SIGNING_PROPS}").withInputStream { p.load(it) }
            storeFile file(p["storeFile"])
            storePassword p["storePassword"]
            keyAlias p["keyAlias"]
            keyPassword p["keyPassword"]
        }`);
const i = g.indexOf("release {", g.indexOf("buildTypes {"));
const j = g.indexOf("signingConfig signingConfigs.debug", i);
if (i < 0 || j < 0) throw new Error("Could not find the release signing line in build.gradle");
g = g.slice(0, j) + "signingConfig signingConfigs.release" + g.slice(j + "signingConfig signingConfigs.debug".length);
fs.writeFileSync("android/app/build.gradle", g);
let p = fs.readFileSync("android/gradle.properties", "utf8");
p = p.replace(/^reactNativeArchitectures=.*$/m, "reactNativeArchitectures=arm64-v8a");
fs.writeFileSync("android/gradle.properties", p);
'

# A build we share must not allow plain http.
if grep -q 'usesCleartextTraffic="true"' android/app/src/main/AndroidManifest.xml; then
  echo "The manifest allows cleartext traffic; refusing to build a shared APK." >&2
  exit 1
fi

# 4. Build.
(cd android && EXPO_PUBLIC_API_URL="$API_URL" NODE_ENV=production ./gradlew assembleRelease -q --console=plain)

mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk dist/school-erp.apk
echo
echo "Built mobile/dist/school-erp.apk  (API: $API_URL, version code: $VERSION_CODE)"
ls -lh dist/school-erp.apk | awk '{print "Size: " $5}'
shasum -a 256 dist/school-erp.apk
