export type SupportTier = "self" | "assisted";
export type ProjectStatus = "onboarding" | "building" | "delivered" | "closed";
export type OwnerSide = "client" | "agency";
export type VerifyType = "manual" | "github" | "vercel" | "supabase";
export type StepStatus =
  | "todo"
  | "doing"
  | "client_done"
  | "verified"
  | "blocked"
  | "skipped"
  | "returned";
export type AuthorSide = "admin" | "client";
export type CommentKind = "question" | "request";

export type VerifyStatus = "verified" | "not_found" | "error";

export type VerifyResult = {
  status: VerifyStatus;
  checked_at: string;
  detail?: string;
  code?: string;
  // 누가 다음에 움직이는가 — client(의뢰인이 고친다) / admin(내가 수락·확인) / system(일시 오류)
  owner?: "client" | "admin" | "system";
  // Vercel·Supabase·수동 단계: 내가 메일함을 보고 누른 결과
  admin_first_ack?: "came" | "not_came";
  admin_first_ack_at?: string; // 「왔음·수락했음」을 누른 시각 — 「수락했는데 안 보임」 판정의 기준

  // 백오프 재확인용. 의뢰인 클릭 횟수(막힘 판정의 유일한 분모)와 자동 재확인 횟수를 따로 센다
  client_attempts?: number;
  auto_checks?: number;
  next_check_at?: string;
  first_failed_at?: string;
}

export type NoticeKind =
  | "credentials"
  | "next_step"
  | "rerequest"
  | "reminder"
  | "escalation"
  | "digest"
  | "admin_replied"
  | "scope_ready"
  | "link_pinned"
  | "closed"
  | "client_event"
  | "verify_event"
  | "token_event"
  | "push_test"
  | "preflight";
export type NoticeChannel = "push" | "outbox";
export type NoticeStatus = "claimed" | "pending" | "sent" | "failed" | "skipped" | "superseded";
export type NoticeSkipReason = "admin" | "condition_cleared" | "cap";

// 장부 한 줄. push: 내 폰으로 실제 보낸 기록. outbox: 관리자가 카톡으로 보낼 완성 문구
export type NoticeRow = {
  id: string;
  project_id: string | null;
  step_id: string | null;
  kind: NoticeKind;
  channel: NoticeChannel;
  dedupe_key: string;
  status: NoticeStatus;
  title: string | null;
  body: string | null;
  skip_reason: NoticeSkipReason | null;
  claimed_at: string | null;
  sent_at: string | null;
  acked_at: string | null;
  day_kst: string;
  detail: string | null;
  created_at: string;
  updated_at: string;
}

export type AdminRow = {
  id: string;
  email: string;
  last_tick_started_at: string | null;
  last_tick_finished_at: string | null;
  last_token_check_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectRow = {
  id: string;
  code: string;
  name: string;
  client_name: string;
  client_email: string;
  support_tier: SupportTier;
  status: ProjectStatus;
  github_org: string | null;
  vercel_team: string | null;
  supabase_org: string | null;
  domain: string | null;
  scope_md: string | null;
  scope_agreed_at: string | null;
  closed_at: string | null;
  access_sent_at: string | null;
  remind_paused_until: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectGuestRow = {
  id: string;
  project_id: string;
  email: string;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export type StepRow = {
  id: string;
  project_id: string;
  order_index: number;
  key: string;
  title: string;
  description_md: string;
  owner_side: OwnerSide;
  verify_type: VerifyType;
  status: StepStatus;
  checked_at: string | null;
  verified_at: string | null;
  verify_result: VerifyResult | null;
  blocked_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type LinkRow = {
  id: string;
  project_id: string;
  order_index: number;
  label: string;
  url: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  last_ack_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CommentRow = {
  id: string;
  project_id: string;
  step_id: string | null;
  author_side: AuthorSide;
  kind: CommentKind;
  body: string;
  read_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

type TableDef<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      admins: TableDef<AdminRow, { email: string }, Partial<AdminRow>>;
      notices: TableDef<
        NoticeRow,
        {
          project_id?: string | null;
          step_id?: string | null;
          kind: NoticeKind;
          channel: NoticeChannel;
          dedupe_key: string;
          status: NoticeStatus;
          title?: string | null;
          body?: string | null;
          skip_reason?: NoticeSkipReason | null;
          claimed_at?: string | null;
          sent_at?: string | null;
          day_kst: string;
          detail?: string | null;
        },
        Partial<Omit<NoticeRow, "id" | "created_at" | "updated_at">>
      >;
      push_subscriptions: TableDef<
        PushSubscriptionRow,
        { endpoint: string; p256dh: string; auth: string; user_agent?: string | null },
        Partial<PushSubscriptionRow>
      >;
      projects: TableDef<
        ProjectRow,
        {
          code: string;
          name: string;
          client_name: string;
          client_email: string;
          support_tier?: SupportTier;
          status?: ProjectStatus;
          github_org?: string | null;
          vercel_team?: string | null;
          supabase_org?: string | null;
          domain?: string | null;
          scope_md?: string | null;
          scope_agreed_at?: string | null;
          closed_at?: string | null;
          access_sent_at?: string | null;
          remind_paused_until?: string | null;
        },
        Partial<Omit<ProjectRow, "id" | "created_at" | "updated_at">>
      >;
      project_guests: TableDef<
        ProjectGuestRow,
        { project_id: string; email: string },
        Partial<Pick<ProjectGuestRow, "email" | "last_seen_at">>
      >;
      steps: TableDef<
        StepRow,
        {
          project_id: string;
          order_index: number;
          key: string;
          title: string;
          description_md?: string;
          owner_side: OwnerSide;
          verify_type?: VerifyType;
          status?: StepStatus;
        },
        Partial<Omit<StepRow, "id" | "created_at" | "updated_at">>
      >;
      links: TableDef<
        LinkRow,
        {
          project_id: string;
          order_index?: number;
          label: string;
          url: string;
          is_pinned?: boolean;
        },
        Partial<Omit<LinkRow, "id" | "created_at" | "updated_at">>
      >;
      comments: TableDef<
        CommentRow,
        {
          project_id: string;
          step_id?: string | null;
          author_side: AuthorSide;
          kind: CommentKind;
          body: string;
        },
        Partial<Pick<CommentRow, "read_at" | "deleted_at">>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      my_project_ids: { Args: Record<string, never>; Returns: string[] };
      tick_begin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
