import { ko } from "@/content/ko";

// 원인 코드 → 문장. 단계별 덮어쓰기(ko.*.verifyCodeByKey)가 있으면 그것을, 없으면 공통 문장을 쓴다.
// 초대가 아닌 확인(서비스 계정)에 「초대 화면에서 이메일을…」이 나가는 것을 막는 한 곳이다.
export function clientCodeText(code: string | null | undefined, stepKey: string, home = false): string | undefined {
  if (!code) return undefined;
  const byKey = home
    ? (ko.stepDetail.verifyCodeHomeByKey[stepKey]?.[code] ?? ko.stepDetail.verifyCodeByKey[stepKey]?.[code])
    : ko.stepDetail.verifyCodeByKey[stepKey]?.[code];
  if (byKey) return byKey;
  const common = ko.stepDetail.verifyCode as Record<string, string | undefined>;
  if (home) return ko.stepDetail.verifyCodeHome[code] ?? common[code];
  return common[code];
}

export function adminCodeText(code: string | null | undefined, stepKey: string): string | undefined {
  if (!code) return undefined;
  return ko.admin.verifyCodeByKey[stepKey]?.[code] ?? (ko.admin.verifyCode as Record<string, string | undefined>)[code];
}

// 2탭(「왔음/안 왔음」) 문구 — 단계별 덮어쓰기가 있으면 그것을 쓴다
export function ackCopy(stepKey: string) {
  const base = ko.admin.ack;
  const over = ko.admin.ackByKey[stepKey];
  return over ? { ...base, ...over } : base;
}
