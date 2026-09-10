import type { VerifyResult, VerifyStatus } from "@/lib/database.types";

// 검증 결과는 반드시 3상태로 구분한다.
//   verified  — 실제로 초대가 완료됨
//   not_found — 아직 안 됨 (조직 없음 / 초대 안 됨 / 수락 대기)
//   error     — 검증 자체가 실패 (토큰 만료·권한·네트워크 등)
// error를 not_found로 뭉뚱그리지 않는다.
//
// code 가 status 와 「누가 다음에 움직이는가(owner)」를 결정한다 — 표에서 찾으므로
// "error 를 not_found 로 흘리는" 실수가 타입에서 막힌다.
export type { VerifyResult };

export type VerifyOwner = "client" | "admin" | "system";

export type VerifyCode =
  | "member_active"
  | "no_slug"
  | "org_not_found"
  | "personal_account"
  | "check_invite"
  | "await_admin_first"
  | "wrong_role"
  | "pending_accept"
  | "await_admin_ack"
  | "token_missing"
  | "token_invalid"
  | "token_scope"
  | "email_mismatch"
  | "admin_email_missing"
  | "field_missing"
  | "rate_limited"
  | "upstream"
  | "network";

export const CODE_TABLE: Record<VerifyCode, { status: VerifyStatus; owner: VerifyOwner | null }> = {
  member_active: { status: "verified", owner: null },
  // 의뢰인이 고칠 수 있는 것
  no_slug: { status: "not_found", owner: "client" },
  org_not_found: { status: "not_found", owner: "client" },
  personal_account: { status: "not_found", owner: "client" },
  check_invite: { status: "not_found", owner: "client" },
  wrong_role: { status: "not_found", owner: "client" },
  // 내가 움직여야 하는 것 (초대 수락·메일함 확인)
  await_admin_first: { status: "not_found", owner: "admin" },
  pending_accept: { status: "not_found", owner: "admin" },
  await_admin_ack: { status: "not_found", owner: "admin" },
  // 내 쪽 설정 문제
  token_missing: { status: "error", owner: "admin" },
  token_invalid: { status: "error", owner: "admin" },
  token_scope: { status: "error", owner: "admin" },
  email_mismatch: { status: "error", owner: "admin" },
  admin_email_missing: { status: "error", owner: "admin" },
  field_missing: { status: "error", owner: "admin" },
  // 일시적 — 조용히 다시 본다
  rate_limited: { status: "error", owner: "system" },
  upstream: { status: "error", owner: "system" },
  network: { status: "error", owner: "system" },
};

export function isVerifyCode(value: unknown): value is VerifyCode {
  return typeof value === "string" && value in CODE_TABLE;
}

export function ownerOf(result: VerifyResult | null): VerifyOwner | null {
  if (!result) return null;
  if (result.owner) return result.owner;
  return isVerifyCode(result.code) ? CODE_TABLE[result.code].owner : null;
}

export function classify(code: VerifyCode, detail?: string): VerifyResult {
  const { status, owner } = CODE_TABLE[code];
  return {
    status,
    code,
    checked_at: new Date().toISOString(),
    ...(owner ? { owner } : {}),
    ...(detail ? { detail } : {}),
  };
}

// 외부 API 한 번의 대기 상한. 크론 tick과 서버 액션 안에서 도는 검증이
// 응답 없는 서비스에 매달려 함수 시간을 다 쓰는 일을 막는다
export const FETCH_TIMEOUT_MS = 8_000;

// HTTP 상태를 코드로. 401/403 은 호출자가 먼저 판단한다(서비스마다 뜻이 다르다)
export function upstreamResult(service: string, status: number): VerifyResult {
  if (status === 429) return classify("rate_limited", `${service} API 호출 한도 (HTTP 429)`);
  return classify("upstream", `${service} API 오류 (HTTP ${status})`);
}

export function networkResult(service: string, cause: unknown): VerifyResult {
  const message = cause instanceof Error ? cause.message : "unknown";
  return classify("network", `${service} API 호출 실패: ${message}`);
}
