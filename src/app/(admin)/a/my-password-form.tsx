"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeMyPassword } from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";

const myPasswordSchema = z.object({
  newPassword: z.string().min(8, ko.admin.password.tooShort).max(100),
});

type MyPasswordValues = z.infer<typeof myPasswordSchema>;

// 관리자 본인 비밀번호 변경 (대시보드 하단, 접이식)
export function MyPasswordForm() {
  const [notice, setNotice] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MyPasswordValues>({ resolver: zodResolver(myPasswordSchema) });

  async function onSubmit(values: MyPasswordValues) {
    setNotice(null);
    setServerError(null);
    const result = await changeMyPassword(values);
    if (!result.ok) {
      setServerError(result.message ?? ko.common.error);
      return;
    }
    reset();
    setNotice(ko.admin.password.changed);
  }

  return (
    <details className="max-w-md rounded-lg border border-border px-4 py-3">
      <summary className="flex min-h-8 cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground">
        <KeyRound className="size-4" />
        {ko.admin.password.myPasswordTitle}
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        {ko.admin.password.myPasswordHelp}
      </p>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-3 flex items-start gap-2"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder={ko.admin.password.newPasswordLabel}
            {...register("newPassword")}
          />
          {errors.newPassword ? (
            <p className="text-sm text-destructive">
              {errors.newPassword.message}
            </p>
          ) : null}
          {serverError ? (
            <p className="text-sm text-destructive">{serverError}</p>
          ) : null}
          {notice ? <p className="text-sm text-success">{notice}</p> : null}
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {ko.admin.password.change}
        </Button>
      </form>
    </details>
  );
}
