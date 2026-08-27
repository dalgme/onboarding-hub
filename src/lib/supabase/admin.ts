import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// service_role 클라이언트. 서버 전용 — 검증 결과 기록처럼
// "서버가 결정하는" 쓰기에만 쓴다. 절대 클라이언트로 내보내지 않는다.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
