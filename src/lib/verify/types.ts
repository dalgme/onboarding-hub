import type { VerifyResult } from "@/lib/database.types";

// 검증 결과는 반드시 3상태로 구분한다.
//   verified  — 실제로 초대가 완료됨
//   not_found — 아직 안 됨 (조직 없음 / 초대 안 됨 / 수락 대기)
//   error     — 검증 자체가 실패 (토큰 만료·권한·네트워크 등)
// error를 not_found로 뭉뚱그리지 않는다.
export type { VerifyResult };

// code: 화면·할 일 목록이 원인을 구분할 수 있게 하는 분류.
//   pending_accept — 초대는 됐고 내가 수락하면 끝난다 (내 할 일)
//   check_invite   — 멤버 목록에 없다: 초대 전이거나 수락 전이거나 이름이 다르다
//   no_slug        — 조직 이름이 아직 저장되지 않았다
export function makeResult(
  status: VerifyResult["status"],
  detail?: string,
  code?: string,
): VerifyResult {
  return { status, checked_at: new Date().toISOString(), detail, code };
}
