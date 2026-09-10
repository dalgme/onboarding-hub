import { Suspense } from "react";
import { ko } from "@/content/ko";
import { NewProjectForm } from "@/app/(admin)/a/new/new-project-form";
import { VerifyTokenWarning } from "@/app/(admin)/a/verify-health";

export default function NewProjectPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5">
      <h1 className="text-xl font-bold">{ko.admin.newProject}</h1>
      <Suspense fallback={null}>
        <VerifyTokenWarning />
      </Suspense>
      <p className="text-sm text-muted-foreground">
        {ko.admin.form.createHelp}
      </p>
      <NewProjectForm />
    </main>
  );
}
