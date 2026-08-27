"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/common/markdown";
import { saveScope } from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";

// 작업 범위 한 칸. 통화·미팅 결과를 내가 정리해 적는다. 문답 폼은 없다.
export function ScopeForm({
  projectId,
  projectCode,
  scopeMd,
  scopeAgreedAt,
  requestsSinceAgreed,
}: {
  projectId: string;
  projectCode: string;
  scopeMd: string;
  scopeAgreedAt: string | null;
  requestsSinceAgreed: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(scopeMd);
  const [showPreview, setShowPreview] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function submit(agree: boolean) {
    setNotice(null);
    startTransition(async () => {
      const result = await saveScope({
        projectId,
        code: projectCode,
        scopeMd: value,
        agree,
      });
      setNotice(result.ok ? ko.common.saved : (result.message ?? ko.common.error));
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{ko.admin.scope.title}</h2>
        {scopeAgreedAt ? (
          <Badge variant="success">
            {ko.admin.scope.agreedAt(
              format(new Date(scopeAgreedAt), "yyyy.MM.dd"),
            )}
          </Badge>
        ) : (
          <Badge variant="muted">{ko.admin.scope.notAgreed}</Badge>
        )}
        {scopeAgreedAt ? (
          <Badge variant={requestsSinceAgreed > 0 ? "warning" : "outline"}>
            {ko.admin.scope.requestsSince(requestsSinceAgreed)}
          </Badge>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">{ko.admin.scope.help}</p>
      <p className="text-xs text-muted-foreground">
        {ko.admin.scope.requestsHelp}
      </p>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={showPreview ? "outline" : "secondary"}
          size="sm"
          onClick={() => setShowPreview(false)}
        >
          {ko.common.edit}
        </Button>
        <Button
          type="button"
          variant={showPreview ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowPreview(true)}
        >
          {ko.admin.scope.preview}
        </Button>
      </div>

      {showPreview ? (
        <div className="rounded-lg border border-border p-5">
          <Markdown>{value}</Markdown>
        </div>
      ) : (
        <Textarea
          className="min-h-80 font-mono text-sm"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      )}

      {notice ? <p className="text-sm text-success">{notice}</p> : null}

      <div className="flex gap-2">
        <Button type="button" disabled={pending} onClick={() => submit(false)}>
          {ko.common.save}
        </Button>
        <Button
          type="button"
          variant="success"
          disabled={pending}
          onClick={() => submit(true)}
        >
          {ko.admin.scope.agree}
        </Button>
      </div>
    </div>
  );
}
