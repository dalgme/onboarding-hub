"use client";

import { useState } from "react";
import { format } from "date-fns";
import { KeyRound, Link2, MessageSquareShare, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/common/copy-button";
import {
  generateGuestMagicLink,
  issueGuestPassword,
  markAccessSent,
} from "@/app/(admin)/a/actions";
import { shareOrCopy } from "@/app/(admin)/a/outbox-list";
import { ko } from "@/content/ko";
import type { ProjectGuestRow } from "@/lib/database.types";
import type { PreflightIssue } from "@/lib/preflight";

// 의뢰인 접속 정보 관리: 비밀번호 발급(주 수단) + 1회용 로그인 링크(보조).
// 사전 점검 빨강이면 두 버튼 모두 비활성 — 우회 없음.
// 발급된 안내문은 「카톡으로 보내기」 한 번으로 공유/복사되고 그 순간 「보냈음」이 기록된다.
export function AccessPanel({
  guests,
  projectId,
  projectCode,
  projectName,
  linkTtlHours,
  preflightIssues,
  accessSentAt,
}: {
  guests: ProjectGuestRow[];
  projectId: string;
  projectCode: string;
  projectName: string;
  linkTtlHours: number;
  preflightIssues: PreflightIssue[];
  accessSentAt: string | null;
}) {
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, string>>({});
  const [sentNote, setSentNote] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const red = preflightIssues.filter((issue) => issue.level === "red");
  const yellow = preflightIssues.filter((issue) => issue.level === "yellow");
  const blocked = red.length > 0;

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
      setSentNote((current) => ({ ...current, [email]: "" }));
    } finally {
      setBusyEmail(null);
    }
  }

  async function sendCredentials(email: string) {
    const message = messages[email];
    if (!message) return;
    const outcome = await shareOrCopy(message);
    if (!outcome) {
      setSentNote((current) => ({ ...current, [email]: ko.admin.outbox.copyFailed }));
      return;
    }
    const result = await markAccessSent({ projectId, code: projectCode, email });
    setSentNote((current) => ({
      ...current,
      [email]: result.ok ? ko.admin.password.sentJustNow : (result.message ?? ko.common.error),
    }));
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

      {blocked ? (
        <div
          role="alert"
          className="flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
        >
          <span className="flex items-center gap-2 font-semibold text-destructive">
            <ShieldAlert className="size-4 shrink-0" />
            {ko.admin.password.blockedTitle}
          </span>
          <ul className="list-disc pl-5 text-foreground/90">
            {red.map((issue) => (
              <li key={issue.key}>{issue.message}</li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-foreground">{ko.admin.preflight.redHint}</p>
        </div>
      ) : null}
      {yellow.length > 0 ? (
        <ul className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-2.5 text-sm">
          {yellow.map((issue) => (
            <li key={issue.key}>{issue.message}</li>
          ))}
          <li className="mt-1 list-none text-xs text-muted-foreground">{ko.admin.preflight.yellowHint}</li>
        </ul>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {accessSentAt
          ? ko.admin.password.sentRecorded(format(new Date(accessSentAt), "MM.dd HH:mm"))
          : ko.admin.password.notSentYet}
      </p>

      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {guests.map((guest) => (
          <li key={guest.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">{guest.email}</span>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  disabled={busyEmail !== null || blocked}
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
                  disabled={busyEmail !== null || blocked}
                  onClick={() => makeLink(guest.email)}
                  title={ko.admin.magicLink.help(linkTtlHours)}
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
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
                  {messages[guest.email]}
                </pre>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" onClick={() => sendCredentials(guest.email)}>
                    <MessageSquareShare className="size-4" />
                    {ko.admin.password.sendKakao}
                  </Button>
                  <CopyButton
                    value={messages[guest.email]}
                    label={ko.admin.password.copyMessage}
                    size="sm"
                    variant="ghost"
                  />
                  {sentNote[guest.email] ? (
                    <span className="text-xs text-muted-foreground">{sentNote[guest.email]}</span>
                  ) : null}
                </div>
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
