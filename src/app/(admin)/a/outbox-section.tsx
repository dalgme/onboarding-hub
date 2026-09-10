import { createClient } from "@/lib/supabase/server";
import { listOutbox } from "@/lib/outbox";
import { OutboxList } from "@/app/(admin)/a/outbox-list";

// 「보낼 카톡」 — 시스템이 써 둔 문구를 관리자가 카톡으로 보낸다.
// 대시보드 최상단(전체)과 프로젝트 「현재 상황」(그 프로젝트만)에 같은 컴포넌트가 붙는다.
// 보낼 것도 최근 처리한 것도 없으면 아무것도 그리지 않는다.
export async function OutboxSection({ projectId }: { projectId?: string }) {
  const supabase = await createClient();
  const { pending, recent } = await listOutbox(supabase, projectId);
  if (pending.length === 0 && recent.length === 0) return null;
  return <OutboxList pending={pending} recent={recent} showProject={!projectId} />;
}
