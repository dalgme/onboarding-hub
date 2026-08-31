import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { cn } from "@/lib/utils";

// 도우미 답변에는 모델이 웹에서 읽어 온 내용이 섞인다.
// 이미지는 여는 것만으로 외부에 신호가 나가고, 링크는 가짜 로그인 화면으로
// 데려갈 수 있다. 안내문(단계 설명)과 달리 둘 다 제거하고 글자만 남긴다.
const chatSchema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter(
    (tag) => tag !== "img" && tag !== "a",
  ),
};

function Markdown({
  children,
  className,
  variant = "doc",
}: {
  children: string;
  className?: string;
  variant?: "doc" | "chat";
}) {
  return (
    <div
      className={cn(
        "prose-sm max-w-none text-sm leading-relaxed",
        "[&_h1]:mt-5 [&_h1]:text-lg [&_h1]:font-semibold",
        "[&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold",
        "[&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold",
        "[&_p]:my-2 [&_strong]:font-semibold",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1",
        "[&_a]:text-primary [&_a]:underline",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
        "[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md [&_img]:border [&_img]:border-border",
        className,
      )}
    >
      <ReactMarkdown
        rehypePlugins={[
          variant === "chat" ? [rehypeSanitize, chatSchema] : rehypeSanitize,
        ]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export { Markdown };
