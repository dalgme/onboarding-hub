import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 「찾게 하지 말고 데려간다」 — 목적지로 바로 보내는 새 탭 딥링크 카드.
function DeepLinkCard({
  title,
  url,
  buttonLabel,
  children,
}: {
  title: string;
  url: string;
  buttonLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {children}
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
        >
          <ExternalLink className="size-4" />
          {buttonLabel}
        </a>
      </CardContent>
    </Card>
  );
}

export { DeepLinkCard };
