"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeSlug } from "@/lib/slug";
import { saveOrgSlug } from "@/app/(guest)/p/[code]/actions";
import { ko } from "@/content/ko";
import type { ConnectMeta } from "@/lib/steps";

const slugFormSchema = z.object({
  rawSlug: z.string().trim().min(1, ko.common.required),
});

type SlugFormValues = z.infer<typeof slugFormSchema>;

// 의뢰인은 URL 전체를 붙여넣는다 — 입력 즉시 정규화 미리보기를 보여준다.
export function SlugInput({
  meta,
  stepKey,
  projectId,
  projectCode,
  currentSlug,
  onSaved,
}: {
  meta: ConnectMeta;
  stepKey: string;
  projectId: string;
  projectCode: string;
  currentSlug: string | null;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SlugFormValues>({
    resolver: zodResolver(slugFormSchema),
    defaultValues: { rawSlug: currentSlug ?? "" },
  });

  const preview = normalizeSlug(watch("rawSlug") ?? "", meta.provider);

  async function onSubmit(values: SlugFormValues) {
    setServerError(null);
    const result = await saveOrgSlug({
      projectId,
      code: projectCode,
      stepKey,
      rawSlug: values.rawSlug,
    });
    if (!result.ok) {
      setServerError(result.message ?? ko.common.error);
      return;
    }
    router.refresh();
    onSaved?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="rawSlug">{ko.stepDetail.slugLabel(meta.orgNoun)}</Label>
        <Input
          id="rawSlug"
          placeholder={meta.slugPlaceholder}
          autoComplete="off"
          {...register("rawSlug")}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {meta.slugHelp}
        </p>
        {preview ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            {ko.stepDetail.slugNormalized(preview)}
          </p>
        ) : null}
        {errors.rawSlug ? (
          <p className="text-sm text-destructive">{errors.rawSlug.message}</p>
        ) : null}
        {serverError ? (
          <p className="text-sm text-destructive">{serverError}</p>
        ) : null}
      </div>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? ko.common.loading : ko.stepDetail.slugSave}
      </Button>
    </form>
  );
}
