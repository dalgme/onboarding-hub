import type { VerifyResult } from "@/lib/database.types";

// 검증 결과는 반드시 3상태로 구분한다.
//   verified  — 실제로 초대가 완료됨
//   not_found — 아직 안 됨 (조직 없음 / 초대 안 됨 / 수락 대기)
//   error     — 검증 자체가 실패 (토큰 만료·권한·네트워크 등)
// error를 not_found로 뭉뚱그리지 않는다.
export type { VerifyResult };

export function makeResult(
  status: VerifyResult["status"],
  detail?: string,
): VerifyResult {
  return { status, checked_at: new Date().toISOString(), detail };
}
