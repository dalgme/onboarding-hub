"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { ko } from "@/content/ko";

// 여러 프로젝트에 등록된 의뢰인용 전환 메뉴. 1개뿐이면 렌더되지 않는다.
export function ProjectSwitcher({
  projects,
  currentCode,
}: {
  projects: { code: string; name: string }[];
  currentCode: string;
}) {
  const router = useRouter();

  return (
    <Select
      aria-label={ko.portal.switcherLabel}
      className="min-h-9 w-auto max-w-[60vw] border-none bg-transparent px-1 py-0 text-sm font-semibold"
      value={currentCode}
      onChange={(event) => router.push(`/p/${event.target.value}`)}
    >
      {projects.map((project) => (
        <option key={project.code} value={project.code}>
          {project.name}
        </option>
      ))}
    </Select>
  );
}
