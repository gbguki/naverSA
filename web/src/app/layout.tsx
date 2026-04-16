import type { Metadata } from "next";
import { Suspense } from "react";
import AppFrame from "@/components/AppFrame";
import "./globals.css";

export const metadata: Metadata = {
  title: "GB_NAVER_SA",
  description: "GrowthB · 네이버 검색광고 운영 콘솔 (구매완료 기반)",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
        <Suspense fallback={null}>
          <AppFrame>{children}</AppFrame>
        </Suspense>
      </body>
    </html>
  );
}
