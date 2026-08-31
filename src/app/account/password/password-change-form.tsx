"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ko } from "@/content/ko";

const changeSchema = z
  .object({
    newPassword: z.string().min(8, ko.admin.password.tooShort).max(100),
    confirm: z.string(),
  })
  .refine((values) => values.newPassword === values.confirm, {
    message: ko.passwordChange.mismatch,
    path: ["confirm"],
  });

type ChangeValues = z.infer<typeof changeSchema>;

export function PasswordChangeForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangeValues>({ resolver: zodResolver(changeSchema) });

  async function onSubmit(values: ChangeValues) {
    setServerError(null);
    const supabase = createClient();
    // 비밀번호 교체와 동시에 '임시' 표시를 해제한다
    const { error } = await supabase.auth.updateUser({
      password: values.newPassword,
      data: { must_change_password: false },
    });
    if (error) {
      setServerError(ko.common.error);
      return;
    }
    window.location.assign("/");
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword">{ko.passwordChange.newPasswordLabel}</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          {...register("newPassword")}
        />
        {errors.newPassword ? (
          <p className="text-sm text-destructive">
            {errors.newPassword.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">{ko.passwordChange.confirmLabel}</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          {...register("confirm")}
        />
        {errors.confirm ? (
          <p className="text-sm text-destructive">{errors.confirm.message}</p>
        ) : null}
      </div>
      {serverError ? (
        <p className="text-sm text-destructive">{serverError}</p>
      ) : null}
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? ko.passwordChange.submitting : ko.passwordChange.submit}
      </Button>
    </form>
  );
}
