import { Suspense } from "react";
import { ko } from "@/content/ko";
import { NewProjectForm } from "@/app/(admin)/a/new/new-project-form";
import { PreflightPanel } from "@/app/(admin)/a/preflight-panel";

// 토큰 점검이 들어 있어 빌드 시점에 미리 그리지 않는다 — 요청마다 실제 상태를 본다
export const dynamic = "force-dynamic";

export default function NewProjectPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5">
      <h1 className="text-xl font-bold">{ko.admin.newProject}</h1>
      <Suspense fallback={null}>
        <PreflightPanel />
      </Suspense>
      <p className="text-sm text-muted-foreground">
        {ko.admin.form.createHelp}
      </p>
      <NewProjectForm />
    </main>
  );
}
