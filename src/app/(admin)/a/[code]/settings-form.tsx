"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { updateProject } from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";
import type { ProjectRow } from "@/lib/database.types";

const settingsSchema = z.object({
  name: z.string().trim().min(1, ko.common.required).max(100),
  clientName: z.string().trim().min(1, ko.common.required).max(100),
  clientEmail: z.email(ko.common.invalidEmail),
  supportTier: z.enum(["self", "assisted"]),
  status: z.enum(["onboarding", "building", "delivered", "closed"]),
  githubOrg: z.string().trim().max(100),
  vercelTeam: z.string().trim().max(100),
  supabaseOrg: z.string().trim().max(100),
  domain: z.string().trim().max(200),
});

type SettingsValues = z.infer<typeof settingsSchema>;

export function SettingsForm({ project }: { project: ProjectRow }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: project.name,
      clientName: project.client_name,
      clientEmail: project.client_email,
      supportTier: project.support_tier,
      status: project.status,
      githubOrg: project.github_org ?? "",
      vercelTeam: project.vercel_team ?? "",
      supabaseOrg: project.supabase_org ?? "",
      domain: project.domain ?? "",
    },
  });

  async function onSubmit(values: SettingsValues) {
    setNotice(null);
    setServerError(null);
    const result = await updateProject({
      projectId: project.id,
      code: project.code,
      ...values,
    });
    if (!result.ok) {
      setServerError(result.message ?? ko.common.error);
      return;
    }
    setNotice(ko.common.saved);
    router.refresh();
  }

  const fieldError = (message?: string) =>
    message ? <p className="text-sm text-destructive">{message}</p> : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{ko.admin.tabSettings}</h2>

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{ko.admin.form.name}</Label>
        <Input id="name" {...register("name")} />
        {fieldError(errors.name?.message)}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="clientName">{ko.admin.form.clientName}</Label>
          <Input id="clientName" {...register("clientName")} />
          {fieldError(errors.clientName?.message)}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="clientEmail">{ko.admin.form.clientEmail}</Label>
          <Input id="clientEmail" type="email" {...register("clientEmail")} />
          {fieldError(errors.clientEmail?.message)}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="supportTier">{ko.admin.form.supportTier}</Label>
          <Select id="supportTier" {...register("supportTier")}>
            <option value="assisted">{ko.status.tier.assisted}</option>
            <option value="self">{ko.status.tier.self}</option>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="status">{ko.admin.form.status}</Label>
          <Select id="status" {...register("status")}>
            <option value="onboarding">{ko.status.project.onboarding}</option>
            <option value="building">{ko.status.project.building}</option>
            <option value="delivered">{ko.status.project.delivered}</option>
            <option value="closed">{ko.status.project.closed}</option>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="githubOrg">{ko.admin.form.githubOrg}</Label>
          <Input id="githubOrg" autoComplete="off" {...register("githubOrg")} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="vercelTeam">{ko.admin.form.vercelTeam}</Label>
          <Input id="vercelTeam" autoComplete="off" {...register("vercelTeam")} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="supabaseOrg">{ko.admin.form.supabaseOrg}</Label>
          <Input
            id="supabaseOrg"
            autoComplete="off"
            {...register("supabaseOrg")}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="domain">{ko.admin.form.domain}</Label>
        <Input
          id="domain"
          placeholder="example.com"
          autoComplete="off"
          {...register("domain")}
        />
      </div>

      {notice ? <p className="text-sm text-success">{notice}</p> : null}
      {serverError ? (
        <p className="text-sm text-destructive">{serverError}</p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {ko.common.save}
      </Button>
    </form>
  );
}
