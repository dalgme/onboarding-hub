import type { Metadata, Viewport } from "next";
import { ko } from "@/content/ko";
import { PwaRegister } from "@/components/common/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: ko.common.appName,
  robots: { index: false, follow: false },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: ko.common.appName,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#2456c9",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
