"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/common/copy-button";
import { generateGuestMagicLink } from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";
import type { ProjectGuestRow } from "@/lib/database.types";

// 로그인 링크(매직링크)를 직접 만들어 카톡 등으로 전달하기 위한 패널.
export function MagicLinkPanel({
  guests,
  projectId,
}: {
  guests: ProjectGuestRow[];
  projectId: string;
}) {
  const [generatingEmail, setGeneratingEmail] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function generate(email: string) {
    setErrorMessage(null);
    setGeneratingEmail(email);
    try {
      const result = await generateGuestMagicLink({ projectId, email });
      if (!result.ok || !result.link) {
        setErrorMessage(result.message ?? ko.common.error);
        return;
      }
      setLinks((current) => ({ ...current, [email]: result.link! }));
    } finally {
      setGeneratingEmail(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <KeyRound className="size-4" />
        {ko.admin.magicLink.title}
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {ko.admin.magicLink.help}
      </p>
      <p className="rounded-md bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
        {ko.admin.magicLink.warning}
      </p>

      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {guests.map((guest) => (
          <li key={guest.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">{guest.email}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={generatingEmail !== null}
                onClick={() => generate(guest.email)}
              >
                {generatingEmail === guest.email
                  ? ko.admin.magicLink.generating
                  : ko.admin.magicLink.generate}
              </Button>
            </div>
            {links[guest.email] ? (
              <div className="flex flex-col gap-2 rounded-md bg-muted px-3 py-2.5">
                <p className="text-xs font-medium text-success">
                  {ko.admin.magicLink.linkReady(guest.email)}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  {links[guest.email]}
                </p>
                <div className="flex items-center gap-2">
                  <CopyButton
                    value={links[guest.email]}
                    label={ko.admin.magicLink.copyLink}
                    size="sm"
                  />
                  <span className="text-xs text-muted-foreground">
                    {ko.admin.magicLink.regenerateNote}
                  </span>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
