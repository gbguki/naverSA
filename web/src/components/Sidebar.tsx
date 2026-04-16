"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  activateCredential, AuthError, Credential, fetchCredentials, fetchMe, logout, Me,
} from "@/lib/api";

type Item = { label: string; href: string; match?: (path: string, search: string) => boolean };
type Group = { title: string; items: Item[]; defaultOpen?: boolean };

const groups: Group[] = [
  {
    title: "대시보드",
    defaultOpen: true,
    items: [
      { label: "전체", href: "/?media=all", match: (p, s) => p === "/" && (s === "" || s.includes("media=all")) },
      { label: "파워링크", href: "/?media=powerlink", match: (p, s) => p === "/" && s.includes("media=powerlink") },
      { label: "쇼핑검색", href: "/?media=shopping", match: (p, s) => p === "/" && s.includes("media=shopping") },
    ],
  },
  {
    title: "규칙 설정",
    defaultOpen: true,
    items: [
      { label: "입찰가 규칙", href: "/rules/bids", match: (p) => p.startsWith("/rules/bids") },
      { label: "키워드 규칙", href: "/rules/keywords", match: (p) => p.startsWith("/rules/keywords") },
    ],
  },
  {
    title: "계정",
    defaultOpen: true,
    items: [
      { label: "계정 관리", href: "/settings/credentials", match: (p) => p.startsWith("/settings/credentials") },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchStr = searchParams.toString();

  const [me, setMe] = useState<Me | null>(null);
  const [creds, setCreds] = useState<Credential[]>([]);
  const [showAcct, setShowAcct] = useState(false);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.title, !g.defaultOpen]))
  );

  const onAuthPage = pathname === "/login" || pathname === "/signup";

  useEffect(() => {
    if (onAuthPage) return;
    fetchMe().then(setMe).catch((e) => {
      if (!(e instanceof AuthError)) console.error(e);
    });
    fetchCredentials().then(setCreds).catch((e) => {
      if (!(e instanceof AuthError)) console.error(e);
    });
  }, [onAuthPage, pathname]);

  if (onAuthPage) return null;

  function isActive(item: Item): boolean {
    if (item.match) return item.match(pathname, searchStr);
    return pathname === item.href;
  }

  const active = creds.find((c) => c.isActive);

  async function handleSwitch(id: number) {
    await activateCredential(id);
    setShowAcct(false);
    router.refresh();
    if (typeof window !== "undefined") window.location.reload();
  }

  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-[220px] flex flex-col"
      style={{
        background: "var(--color-glass-bg)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderRight: "1px solid var(--color-glass-border)",
      }}
    >
      <div className="px-5 py-5 border-b" style={{ borderColor: "var(--color-glass-border)" }}>
        <div className="text-[15px] font-semibold" style={{ color: "var(--color-glass-text)", letterSpacing: "-0.374px" }}>
          GrowthB
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: "var(--color-glass-text-muted)" }}>
          GB_NAVER_SA
        </div>
      </div>

      {/* 활성 계정 스위처 */}
      <div className="px-3 pt-3">
        <button
          onClick={() => setShowAcct((v) => !v)}
          className="w-full text-left px-3 py-2 rounded-[8px] flex items-center justify-between gap-2"
          style={{
            background: "var(--color-glass-active)",
            color: "var(--color-glass-text)",
            border: "1px solid var(--color-glass-border)",
          }}
        >
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-glass-text-muted)" }}>
              활성 계정
            </div>
            <div className="text-[12px] mt-0.5 truncate">
              {active ? active.label : "미설정"}
            </div>
            {active && (
              <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--color-glass-text-muted)" }}>
                CUSTOMER {active.customerId}
              </div>
            )}
          </div>
          <span style={{ fontSize: 10, color: "var(--color-glass-text-muted)" }}>{showAcct ? "▲" : "▼"}</span>
        </button>
        {showAcct && (
          <div className="mt-2 rounded-[8px] p-1"
            style={{ background: "rgba(0,0,0,0.4)", border: "1px solid var(--color-glass-border)" }}>
            {creds.length === 0 ? (
              <div className="text-[11px] px-3 py-2" style={{ color: "var(--color-glass-text-muted)" }}>
                등록된 계정 없음
              </div>
            ) : (
              creds.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSwitch(c.id)}
                  className={`nav-item w-full text-left ${c.isActive ? "is-active" : ""}`}
                  style={{ fontSize: 12 }}
                >
                  <span className="truncate">{c.label}</span>
                </button>
              ))
            )}
            <Link
              href="/settings/credentials"
              onClick={() => setShowAcct(false)}
              className="nav-item w-full"
              style={{ fontSize: 11, borderTop: "1px solid var(--color-glass-border)", marginTop: 4, paddingTop: 8 }}
            >
              계정 관리 →
            </Link>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((g) => {
          const isCollapsed = collapsed[g.title];
          return (
            <div key={g.title} className="mb-5">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [g.title]: !c[g.title] }))}
                className="nav-section-title flex w-full items-center justify-between hover:opacity-80"
                style={{ background: "transparent", border: 0, cursor: "pointer" }}
              >
                <span>{g.title}</span>
                <span style={{ fontSize: "10px" }}>{isCollapsed ? "+" : "−"}</span>
              </button>
              {!isCollapsed && (
                <div className="mt-1 flex flex-col gap-0.5">
                  {g.items.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`nav-item ${isActive(item) ? "is-active" : ""}`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t" style={{ borderColor: "var(--color-glass-border)" }}>
        <div className="text-[11px] px-3 mb-1" style={{ color: "var(--color-glass-text-muted)" }}>
          {me?.email ?? ""}
        </div>
        <button onClick={handleLogout} className="nav-item w-full text-left">
          로그아웃
        </button>
      </div>
    </aside>
  );
}
