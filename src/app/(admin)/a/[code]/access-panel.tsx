"use client";

import { useState } from "react";
import { KeyRound, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/common/copy-button";
import {
  generateGuestMagicLink,
  issueGuestPassword,
} from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";
import type { ProjectGuestRow } from "@/lib/database.types";

// 의뢰인 접속 정보 관리: 비밀번호 발급(주 수단) + 1회용 로그인 링크(보조).
export function AccessPanel({
  guests,
  projectId,
  projectCode,
  projectName,
}: {
  guests: ProjectGuestRow[];
  projectId: string;
  projectCode: string;
  projectName: string;
}) {
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function issuePassword(email: string) {
    setErrorMessage(null);
    setBusyEmail(email);
    try {
      const result = await issueGuestPassword({ projectId, email });
      if (!result.ok || !result.password) {
        setErrorMessage(result.message ?? ko.common.error);
        return;
      }
      const portalUrl = `${window.location.origin}/p/${projectCode}`;
      const message = ko.admin.password.kakaoMessage({
        projectName,
        portalUrl,
        email,
        password: result.password,
      });
      setMessages((current) => ({ ...current, [email]: message }));
    } finally {
      setBusyEmail(null);
    }
  }

  async function makeLink(email: string) {
    setErrorMessage(null);
    setBusyEmail(email);
    try {
      const result = await generateGuestMagicLink({ projectId, email });
      if (!result.ok || !result.link) {
        setErrorMessage(result.message ?? ko.common.error);
        return;
      }
      setLinks((current) => ({ ...current, [email]: result.link! }));
    } finally {
      setBusyEmail(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <KeyRound className="size-4" />
        {ko.admin.password.title}
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {ko.admin.password.help}
      </p>

      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {guests.map((guest) => (
          <li key={guest.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">{guest.email}</span>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  disabled={busyEmail !== null}
                  onClick={() => issuePassword(guest.email)}
                >
                  {busyEmail === guest.email
                    ? ko.admin.password.issuing
                    : messages[guest.email]
                      ? ko.admin.password.reissue
                      : ko.admin.password.issue}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busyEmail !== null}
                  onClick={() => makeLink(guest.email)}
                  title={ko.admin.magicLink.help}
                >
                  <Link2 className="size-4" />
                  {ko.admin.magicLink.title}
                </Button>
              </div>
            </div>

            {messages[guest.email] ? (
              <div className="flex flex-col gap-2 rounded-md bg-muted px-3 py-2.5">
                <p className="text-xs font-medium text-success">
                  {ko.admin.password.messageReady(guest.email)}
                </p>
                <pre className="whitespace-pre-wrap break-all font-sans text-xs text-muted-foreground">
                  {messages[guest.email]}
                </pre>
                <CopyButton
                  value={messages[guest.email]}
                  label={ko.admin.password.copyMessage}
                  size="sm"
                  className="self-start"
                />
              </div>
            ) : null}

            {links[guest.email] ? (
              <div className="flex flex-col gap-2 rounded-md bg-muted px-3 py-2.5">
                <p className="text-xs font-medium text-success">
                  {ko.admin.magicLink.linkReady(guest.email)}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  {links[guest.email]}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton
                    value={links[guest.email]}
                    label={ko.admin.magicLink.copyLink}
                    size="sm"
                  />
                  <span className="text-xs text-muted-foreground">
                    {ko.admin.magicLink.regenerateNote}{" "}
                    {ko.admin.magicLink.warning}
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
