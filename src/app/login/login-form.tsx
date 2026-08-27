"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ko } from "@/content/ko";

const loginSchema = z.object({
  email: z.email(ko.common.invalidEmail),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: values.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });
    if (error) {
      setServerError(ko.common.error);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <MailCheck className="size-6 text-success" />
        <h2 className="mt-3 font-semibold">{ko.login.sentTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {ko.login.sentDescription}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => setSent(false)}
        >
          {ko.login.resend}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{ko.login.emailLabel}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder={ko.login.emailPlaceholder}
          {...register("email")}
        />
        {errors.email ? (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        ) : null}
      </div>
      {serverError ? (
        <p className="text-sm text-destructive">{serverError}</p>
      ) : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? ko.login.submitting : ko.login.submit}
      </Button>
    </form>
  );
}
