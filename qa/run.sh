#!/usr/bin/env bash
# 브라우저 검수 하네스 실행기.
#   qa/run.sh                 전부 (빌드 포함)
#   qa/run.sh auth portal     이름이 맞는 스위트만
#   qa/run.sh --no-build …    직전 검수 빌드를 재사용 (코드가 안 바뀌었을 때)
#   qa/run.sh --build-only    검수용 빌드만 하고 끝
# 전제: Node ≥ 22.18 (TS 파일 직접 import), pnpm, Chromium (qa/ 의 playwright 가 설치한다)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA="$ROOT/qa"
mkdir -p "$QA/.tmp"

BUILD=1; BUILD_ONLY=0; SUITES=()
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    --build-only) BUILD_ONLY=1 ;;
    *) SUITES+=("$arg") ;;
  esac
done

# 1) 하네스 의존성 (앱 의존성과 분리 — qa/package.json)
if [ ! -d "$QA/node_modules/playwright" ]; then
  (cd "$QA" && pnpm install --frozen-lockfile)
fi

# 2) 검수용 VAPID 키 — 환경마다 생성한다. 커밋하지 않는다(.tmp)
if [ ! -f "$QA/.tmp/vapid.env" ]; then
  (cd "$ROOT" && node -e '
    const k = require("web-push").generateVAPIDKeys();
    console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${k.publicKey}`);
    console.log(`VAPID_PRIVATE_KEY=${k.privateKey}`);
  ') > "$QA/.tmp/vapid.env"
fi

# 3) 환경변수 — 전부 가짜 값. NEXT_PUBLIC_* 는 빌드에 박히므로 빌드도 이 env 로 한다
set -a
. "$QA/env.qa"
. "$QA/.tmp/vapid.env"
set +a

# 4) 빌드
if [ "$BUILD" = "1" ]; then
  echo "[qa] next build (검수용 env) …"
  if ! (cd "$ROOT" && pnpm build > "$QA/.tmp/build.log" 2>&1); then
    tail -40 "$QA/.tmp/build.log"
    echo "[qa] 빌드 실패"
    exit 1
  fi
  echo "$NEXT_PUBLIC_SUPABASE_URL" > "$QA/.tmp/built-for"
fi
if [ "$BUILD_ONLY" = "1" ]; then exit 0; fi
if [ ! -f "$QA/.tmp/built-for" ] || [ "$(cat "$QA/.tmp/built-for")" != "$NEXT_PUBLIC_SUPABASE_URL" ]; then
  echo "[qa] 검수용 빌드가 없습니다 — --no-build 를 빼고 다시 실행하세요"
  exit 1
fi

# 5) 모의 서버 + 앱 (앱은 intercept.cjs 를 프리로드해 바깥으로 나가는 호출을 전부 모의 서버로 돌린다)
cleanup() {
  kill "${APP_PID:-}" "${MOCK_PID:-}" 2>/dev/null || true
  wait "${APP_PID:-}" "${MOCK_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT
node "$QA/mock/server.mjs" > "$QA/.tmp/mock.log" 2>&1 &
MOCK_PID=$!
(cd "$ROOT" && NODE_OPTIONS="--require $QA/intercept.cjs" node_modules/.bin/next start -p "$PORT" -H 127.0.0.1 > "$QA/.tmp/app.log" 2>&1) &
APP_PID=$!

wait_for() {
  for _ in $(seq 1 120); do
    if curl -sf -o /dev/null "$1"; then return 0; fi
    sleep 0.5
  done
  echo "[qa] 기다리다 포기: $1"
  return 1
}
wait_for "$QA_MOCK_URL/__qa/health"
wait_for "$QA_APP_URL/login"
echo "[qa] mock $QA_MOCK_URL · app $QA_APP_URL"

# 6) 스위트
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$QA/lib/run.mjs" "${SUITES[@]}"
