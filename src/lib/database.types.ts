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
  | "skipped";
export type AuthorSide = "admin" | "client";
export type CommentKind = "question" | "request";

export type VerifyStatus = "verified" | "not_found" | "error";

export type VerifyResult = {
  status: VerifyStatus;
  checked_at: string;
  detail?: string;
  [key: string]: string | undefined;
}

export type AdminRow = {
  id: string;
  email: string;
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
  created_at: string;
  updated_at: string;
}

export type ProjectGuestRow = {
  id: string;
  project_id: string;
  email: string;
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
        },
        Partial<Omit<ProjectRow, "id" | "created_at" | "updated_at">>
      >;
      project_guests: TableDef<
        ProjectGuestRow,
        { project_id: string; email: string },
        Partial<Pick<ProjectGuestRow, "email">>
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
