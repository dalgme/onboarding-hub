"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ExternalLink, Pin, PinOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { addLink, deleteLink, toggleLinkPin } from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";
import type { LinkRow } from "@/lib/database.types";

const linkFormSchema = z.object({
  label: z.string().trim().min(1, ko.common.required).max(100),
  url: z.url(ko.common.invalidUrl),
  isPinned: z.boolean(),
});

type LinkFormValues = z.infer<typeof linkFormSchema>;

export function LinkManager({
  links,
  projectId,
  projectCode,
}: {
  links: LinkRow[];
  projectId: string;
  projectCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LinkFormValues>({
    resolver: zodResolver(linkFormSchema),
    defaultValues: { isPinned: false },
  });

  async function onSubmit(values: LinkFormValues) {
    setServerError(null);
    const result = await addLink({
      projectId,
      code: projectCode,
      label: values.label,
      url: values.url,
      isPinned: values.isPinned,
    });
    if (!result.ok) {
      setServerError(result.message ?? ko.common.error);
      return;
    }
    reset();
    router.refresh();
  }

  function togglePin(link: LinkRow) {
    startTransition(async () => {
      await toggleLinkPin({
        linkId: link.id,
        code: projectCode,
        isPinned: !link.is_pinned,
      });
      router.refresh();
    });
  }

  function remove(link: LinkRow) {
    if (!window.confirm(ko.comments.deleteConfirm)) return;
    startTransition(async () => {
      await deleteLink({ linkId: link.id, code: projectCode });
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-3 rounded-lg border border-border p-4"
      >
        <h2 className="text-sm font-semibold">{ko.admin.links.addLink}</h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="link-label">{ko.admin.links.label}</Label>
            <Input id="link-label" {...register("label")} />
            {errors.label ? (
              <p className="text-sm text-destructive">{errors.label.message}</p>
            ) : null}
          </div>
          <div className="flex flex-[2] flex-col gap-1.5">
            <Label htmlFor="link-url">{ko.admin.links.url}</Label>
            <Input
              id="link-url"
              placeholder="https://"
              autoComplete="off"
              {...register("url")}
            />
            {errors.url ? (
              <p className="text-sm text-destructive">{errors.url.message}</p>
            ) : null}
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" {...register("isPinned")} />
          {ko.admin.links.pinned}
          <span className="text-xs text-muted-foreground">
            {ko.admin.links.pinnedHelp}
          </span>
        </label>
        {serverError ? (
          <p className="text-sm text-destructive">{serverError}</p>
        ) : null}
        <Button type="submit" disabled={isSubmitting} className="self-start">
          {ko.common.add}
        </Button>
      </form>

      {links.length === 0 ? (
        <EmptyState message={ko.admin.links.empty} />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {link.label}
                  {link.is_pinned ? (
                    <Badge variant="secondary">{ko.admin.links.pinned}</Badge>
                  ) : null}
                </span>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary"
                >
                  {link.url}
                  <ExternalLink className="size-3 shrink-0" />
                </a>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => togglePin(link)}
              >
                {link.is_pinned ? (
                  <PinOff className="size-4" />
                ) : (
                  <Pin className="size-4" />
                )}
                {link.is_pinned ? ko.admin.links.unpin : ko.admin.links.pin}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => remove(link)}
                aria-label={ko.common.delete}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
