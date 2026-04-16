"use client";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onAuthPage = pathname === "/login" || pathname === "/signup";

  return (
    <>
      <Sidebar />
      <main className={onAuthPage ? "min-h-screen" : "ml-[220px] min-h-screen"}>
        {children}
      </main>
    </>
  );
}
