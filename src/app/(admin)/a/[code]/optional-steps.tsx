"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OPTIONAL_STEP_TEMPLATES } from "@/lib/steps";
import { addOptionalStep } from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";

// 의뢰 내용에 따라 필요한 선택 단계(Resend·Solapi 등)를 추가하는 패널.
export function OptionalSteps({
  projectId,
  projectCode,
  existingKeys,
}: {
  projectId: string;
  projectCode: string;
  existingKeys: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const available = OPTIONAL_STEP_TEMPLATES.filter(
    (template) => !existingKeys.includes(template.key),
  );

  function add(stepKey: string) {
    setErrorMessage(null);
    setAddingKey(stepKey);
    startTransition(async () => {
      const result = await addOptionalStep({
        projectId,
        code: projectCode,
        stepKey,
      });
      if (!result.ok) setErrorMessage(result.message ?? ko.common.error);
      setAddingKey(null);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-dashed border-border px-4 py-3">
      <h3 className="text-sm font-semibold">{ko.admin.steps.optionalTitle}</h3>
      <p className="text-xs text-muted-foreground">
        {ko.admin.steps.optionalHelp}
      </p>
      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}
      {available.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {ko.admin.steps.optionalAllAdded}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {available.map((template) => (
            <Button
              key={template.key}
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => add(template.key)}
            >
              <Plus className="size-4" />
              {addingKey === template.key
                ? ko.admin.steps.optionalAdding
                : template.title}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
