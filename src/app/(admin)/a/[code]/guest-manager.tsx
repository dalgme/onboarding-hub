"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { addProjectGuest, removeProjectGuest } from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";
import type { ProjectGuestRow } from "@/lib/database.types";

const guestFormSchema = z.object({
  email: z.email(ko.common.invalidEmail),
});

type GuestFormValues = z.infer<typeof guestFormSchema>;

export function GuestManager({
  guests,
  projectId,
  projectCode,
  accountByEmail = {},
}: {
  guests: ProjectGuestRow[];
  projectId: string;
  projectCode: string;
  accountByEmail?: Record<
    string,
    { lastSignInAt: string | null; tempPassword: boolean }
  >;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GuestFormValues>({ resolver: zodResolver(guestFormSchema) });

  async function onSubmit(values: GuestFormValues) {
    setServerError(null);
    const result = await addProjectGuest({
      projectId,
      code: projectCode,
      email: values.email,
    });
    if (!result.ok) {
      setServerError(result.message ?? ko.common.error);
      return;
    }
    reset();
    router.refresh();
  }

  function remove(guest: ProjectGuestRow) {
    if (!window.confirm(ko.comments.deleteConfirm)) return;
    startTransition(async () => {
      await removeProjectGuest({ guestId: guest.id, code: projectCode });
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{ko.admin.form.guests}</h2>
      <p className="text-sm text-muted-foreground">{ko.admin.form.guestsHelp}</p>

      {guests.length === 0 ? (
        <EmptyState message={ko.common.empty} />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {guests.map((guest) => {
            const account = accountByEmail[guest.email.toLowerCase()];
            return (
              <li key={guest.id} className="flex flex-col gap-1 px-4 py-2.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  {guest.email}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => remove(guest)}
                    aria-label={ko.common.delete}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>
                    {ko.admin.access.lastSeen}:{" "}
                    {guest.last_seen_at
                      ? format(new Date(guest.last_seen_at), "MM.dd HH:mm")
                      : ko.admin.access.neverSeen}
                  </span>
                  {account?.lastSignInAt ? (
                    <span>
                      · {ko.admin.access.lastLogin}:{" "}
                      {format(new Date(account.lastSignInAt), "MM.dd HH:mm")}
                    </span>
                  ) : null}
                  {account ? (
                    <Badge variant={account.tempPassword ? "warning" : "success"}>
                      {account.tempPassword
                        ? ko.admin.access.passwordTemp
                        : ko.admin.access.passwordSet}
                    </Badge>
                  ) : (
                    <Badge variant="muted">{ko.admin.access.noAccount}</Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex items-start gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Input
            type="email"
            placeholder={ko.login.emailPlaceholder}
            autoComplete="off"
            {...register("email")}
          />
          {errors.email ? (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          ) : null}
          {serverError ? (
            <p className="text-sm text-destructive">{serverError}</p>
          ) : null}
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {ko.admin.form.addGuest}
        </Button>
      </form>
    </section>
  );
}
