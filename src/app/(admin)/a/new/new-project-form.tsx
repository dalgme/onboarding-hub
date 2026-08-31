"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createProject } from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";

const newProjectSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, ko.common.required)
    .max(40)
    .regex(/^[a-z0-9-]+$/, ko.admin.form.invalidCode),
  name: z.string().trim().min(1, ko.common.required).max(100),
  clientName: z.string().trim().min(1, ko.common.required).max(100),
  clientEmail: z.email(ko.common.invalidEmail),
  supportTier: z.enum(["self", "assisted"]),
});

type NewProjectValues = z.infer<typeof newProjectSchema>;

export function NewProjectForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewProjectValues>({
    resolver: zodResolver(newProjectSchema),
    defaultValues: { supportTier: "assisted" },
  });

  async function onSubmit(values: NewProjectValues) {
    setServerError(null);
    const result = await createProject(values);
    // 성공 시 서버 액션이 /a/[code]로 redirect한다
    if (result && !result.ok) {
      setServerError(result.message ?? ko.common.error);
    }
  }

  const fieldError = (message?: string) =>
    message ? <p className="text-sm text-destructive">{message}</p> : null;

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">{ko.admin.form.code}</Label>
        <Input
          id="code"
          placeholder={ko.admin.form.codePlaceholder}
          autoComplete="off"
          {...register("code")}
        />
        <p className="text-xs text-muted-foreground">{ko.admin.form.codeHelp}</p>
        {fieldError(errors.code?.message)}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{ko.admin.form.name}</Label>
        <Input id="name" {...register("name")} />
        {fieldError(errors.name?.message)}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="clientName">{ko.admin.form.clientName}</Label>
        <Input id="clientName" {...register("clientName")} />
        {fieldError(errors.clientName?.message)}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="clientEmail">{ko.admin.form.clientEmail}</Label>
        <Input id="clientEmail" type="email" {...register("clientEmail")} />
        <p className="text-xs text-muted-foreground">
          {ko.admin.form.clientEmailHelp}
        </p>
        {fieldError(errors.clientEmail?.message)}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="supportTier">{ko.admin.form.supportTier}</Label>
        <Select id="supportTier" {...register("supportTier")}>
          <option value="assisted">{ko.status.tier.assisted}</option>
          <option value="self">{ko.status.tier.self}</option>
        </Select>
      </div>
      {serverError ? (
        <p className="text-sm text-destructive">{serverError}</p>
      ) : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? ko.admin.form.creating : ko.admin.form.create}
      </Button>
    </form>
  );
}
