#!/usr/bin/env bash
# 개발용: 모의 서버 + 앱을 띄워 둔 채로 두고(백그라운드), 스위트를 따로 여러 번 돌릴 때 쓴다.
#   qa/dev.sh up      띄우기 (직전 검수 빌드 사용)
#   qa/dev.sh down    내리기
#   qa/dev.sh suites [이름…]   스위트 실행 (서버가 떠 있어야 한다)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA="$ROOT/qa"
set -a; . "$QA/env.qa"; [ -f "$QA/.tmp/vapid.env" ] && . "$QA/.tmp/vapid.env"; set +a
case "${1:-}" in
  up)
    pkill -f '^node [^ ]*qa/mock/server\.mjs' 2>/dev/null || true
    pkill -f '^next-server' 2>/dev/null || true
    pkill -f '^node [^ ]*next start -p' 2>/dev/null || true
    sleep 0.3
    (setsid nohup node "$QA/mock/server.mjs" > .tmp/mock.log 2>&1 < /dev/null &)
    (cd "$ROOT" && NODE_OPTIONS="--require $QA/intercept.cjs" setsid nohup node_modules/.bin/next start -p "$PORT" -H 127.0.0.1 > "$QA/.tmp/app.log" 2>&1 < /dev/null &)
    for _ in $(seq 1 60); do curl -sf -o /dev/null "$QA_APP_URL/login" && curl -sf -o /dev/null "$QA_MOCK_URL/__qa/health" && { echo "up: $QA_APP_URL / $QA_MOCK_URL"; exit 0; }; sleep 0.5; done
    echo "서버가 뜨지 않았다"; exit 1 ;;
  down)
    pkill -f '^node [^ ]*qa/mock/server\.mjs' || true
    pkill -f '^next-server' || true
    pkill -f '^node [^ ]*next start -p' || true
    echo down ;;
  suites)
    shift; node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$QA/lib/run.mjs" "$@" ;;
  *) echo "usage: dev.sh up|down|suites [names]"; exit 2 ;;
esac
