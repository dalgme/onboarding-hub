import { cn } from "@/lib/utils";

function EmptyState({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {message}
    </div>
  );
}

export { EmptyState };
