import Link from "next/link";
import { cn } from "@/lib/utils";
import { ko } from "@/content/ko";
import type { TodoItem } from "@/lib/todo";

// 「지금 할 일」 칩 목록. 누르면 처리할 탭으로 간다.
export function TodoList({
  code,
  items,
  emptyText = ko.admin.todo.none,
}: {
  code: string;
  items: TodoItem[];
  emptyText?: string | null;
}) {
  if (items.length === 0) {
    return emptyText ? (
      <span className="text-sm text-muted-foreground">{emptyText}</span>
    ) : null;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={`/a/${code}?tab=${item.tab}`}
            className={cn(
              "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium hover:bg-accent",
              item.urgent
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : "border-border text-foreground",
            )}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
