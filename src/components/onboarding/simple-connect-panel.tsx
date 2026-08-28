import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/common/copy-button";
import { DeepLinkCard } from "@/components/onboarding/deep-link-card";
import { cn } from "@/lib/utils";
import { ko } from "@/content/ko";
import type { SimpleConnectMeta } from "@/lib/steps";

// slug·자동 검증이 없는 연결 단계(Anthropic·Resend·Solapi 등)용 실행 패널:
// 딥링크 + 초대 이메일 복사 + 역할 안내.
function SimpleConnectPanel({
  meta,
  inviteEmail,
}: {
  meta: SimpleConnectMeta;
  inviteEmail: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <DeepLinkCard
        title={meta.serviceName}
        url={meta.createUrl}
        buttonLabel={ko.stepDetail.createButton(meta.serviceName)}
      />
      <Card>
        <CardHeader>
          <CardTitle>{ko.stepDetail.inviteTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="rounded-md bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
            {ko.stepDetail.inviteRole(meta.roleName)}
          </p>
          <CopyButton
            value={inviteEmail}
            label={ko.stepDetail.inviteCopyEmail}
            size="lg"
            className="w-full"
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {ko.stepDetail.inviteHint}
          </p>
          <a
            href={meta.inviteUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            <ExternalLink className="size-4" />
            {ko.stepDetail.inviteOpenPage}
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

export { SimpleConnectPanel };
