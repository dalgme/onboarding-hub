import type { VerifyType } from "@/lib/database.types";

// 의뢰인은 URL 전체를 붙여넣는다. 어떤 형태로 들어와도 조직 slug 하나로 정규화한다.
//   github.com/orgs/foo/people → foo
//   https://vercel.com/teams/foo/settings/members → foo
//   supabase.com/dashboard/org/foo/team → foo
//   @foo, " Foo ", FOO → foo
const PATH_MARKERS: Record<string, string[]> = {
  github: ["orgs", "organizations"],
  vercel: ["teams"],
  supabase: ["org"],
};

const KNOWN_HOSTS = ["github.com", "vercel.com", "supabase.com", "supabase.io"];

export function normalizeSlug(
  raw: string,
  provider?: Exclude<VerifyType, "manual">,
): string {
  let value = raw.trim().toLowerCase();
  if (!value) return "";

  value = value.replace(/^https?:\/\//, "").replace(/^www\./, "");

  const isUrlLike =
    value.includes("/") || KNOWN_HOSTS.some((host) => value.startsWith(host));

  if (isUrlLike) {
    const segments = value
      .split(/[/?#]/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    // 도메인 세그먼트 제거
    const pathSegments = segments.filter(
      (segment) => !KNOWN_HOSTS.includes(segment),
    );

    const markers = provider
      ? PATH_MARKERS[provider]
      : Object.values(PATH_MARKERS).flat();
    const markerIndex = pathSegments.findIndex((segment) =>
      markers.includes(segment),
    );

    if (markerIndex >= 0 && pathSegments[markerIndex + 1]) {
      value = pathSegments[markerIndex + 1];
    } else if (pathSegments.length > 0) {
      // dashboard 같은 고정 경로를 건너뛰고 첫 의미 있는 세그먼트를 취한다
      const skip = new Set(["dashboard", "settings", "team", "people", "members"]);
      value = pathSegments.find((segment) => !skip.has(segment)) ?? "";
    } else {
      value = "";
    }
  }

  value = value.replace(/^@/, "");
  // slug에 쓸 수 없는 문자는 전부 버린다 (공백 포함)
  value = value.replace(/[^a-z0-9._-]/g, "");
  return value;
}
