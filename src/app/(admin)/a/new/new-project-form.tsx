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
import { OPTIONAL_STEP_TEMPLATES, plannedSteps } from "@/lib/steps";
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
  includeAi: z.boolean(),
  optionalKeys: z.array(z.string()),
});

type NewProjectValues = z.infer<typeof newProjectSchema>;

export function NewProjectForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NewProjectValues>({
    resolver: zodResolver(newProjectSchema),
    defaultValues: { supportTier: "assisted", includeAi: true, optionalKeys: [] },
  });
  const includeAi = watch("includeAi");
  const optionalKeys = watch("optionalKeys") ?? [];
  // 미리보기 — 생성되면 이 순서로 단계가 채워진다
  const preview = plannedSteps(optionalKeys).map((template) => ({
    key: template.key,
    title: template.title,
    skipped: !includeAi && template.key === "connect-anthropic",
  }));

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
      <fieldset className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
        <legend className="px-1 text-sm font-medium">{ko.admin.form.stacksTitle}</legend>
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" {...register("includeAi")} />
          {ko.admin.form.stackAi}
        </label>
        {OPTIONAL_STEP_TEMPLATES.map((template) => (
          <label key={template.key} className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" value={template.key} {...register("optionalKeys")} />
            {template.title}
          </label>
        ))}
        <p className="text-xs text-muted-foreground">{ko.admin.form.stacksHelp}</p>
      </fieldset>
      <div className="flex flex-col gap-1.5 rounded-lg bg-muted px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">{ko.admin.form.previewTitle(preview.filter((item) => !item.skipped).length)}</p>
        <ol className="flex flex-col gap-0.5 text-sm">
          {preview.map((item, index) => (
            <li key={item.key} className={item.skipped ? "text-muted-foreground line-through" : ""}>
              {index + 1}. {item.title}
              {item.skipped ? ` — ${ko.status.step.skipped}` : ""}
            </li>
          ))}
        </ol>
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
