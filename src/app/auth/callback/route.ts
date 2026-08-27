import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { resolveHomePath } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const otpType = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let authError = true;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError = Boolean(error);
  } else if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    authError = Boolean(error);
  }

  if (authError) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const home = await resolveHomePath();
  if (!home) {
    // 로그인은 됐지만 어떤 프로젝트에도 등록되지 않은 이메일
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=no_access`);
  }
  return NextResponse.redirect(`${origin}${home}`);
}
