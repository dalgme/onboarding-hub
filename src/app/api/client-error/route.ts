import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  message: z.string().max(500),
  digest: z.string().max(100).optional(),
  path: z.string().max(300).optional(),
});

// 화면에서 난 오류를 서버 로그(Vercel 런타임 로그)로 넘긴다.
// 새 테이블을 만들지 않는다 — 오류 원인 분석은 배포 로그에서 한다.
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new NextResponse(null, { status: 204 });
  }
  console.error("[client-error]", {
    message: parsed.data.message,
    digest: parsed.data.digest ?? null,
    path: parsed.data.path ?? null,
    at: new Date().toISOString(),
  });
  return new NextResponse(null, { status: 204 });
}
