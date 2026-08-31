"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { addGuestComment } from "@/app/(guest)/p/[code]/actions";
import { addAdminComment } from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";
import type { AuthorSide } from "@/lib/database.types";

const commentFormSchema = z.object({
  kind: z.enum(["question", "request"]),
  body: z.string().trim().min(1, ko.common.required).max(4000),
});

type CommentFormValues = z.infer<typeof commentFormSchema>;

export function CommentForm({
  side,
  projectId,
  projectCode,
  stepId,
}: {
  side: AuthorSide;
  projectId: string;
  projectCode: string;
  stepId: string | null;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CommentFormValues>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: { kind: "question", body: "" },
  });

  async function onSubmit(values: CommentFormValues) {
    setServerError(null);
    const action = side === "admin" ? addAdminComment : addGuestComment;
    const result = await action({
      projectId,
      code: projectCode,
      stepId,
      kind: values.kind,
      body: values.body,
    });
    if (!result.ok) {
      setServerError(result.message ?? ko.common.error);
      return;
    }
    reset();
    router.refresh();
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Select className="w-28" {...register("kind")}>
          <option value="question">{ko.comments.kindQuestion}</option>
          <option value="request">{ko.comments.kindRequest}</option>
        </Select>
        <Textarea
          className="min-h-11 flex-1"
          placeholder={ko.comments.bodyPlaceholder}
          {...register("body")}
        />
      </div>
      {errors.body ? (
        <p className="text-sm text-destructive">{errors.body.message}</p>
      ) : null}
      {serverError ? (
        <p className="text-sm text-destructive">{serverError}</p>
      ) : null}
      <Button type="submit" disabled={isSubmitting} className="self-end">
        {isSubmitting ? ko.comments.submitting : ko.comments.submit}
      </Button>
    </form>
  );
}
