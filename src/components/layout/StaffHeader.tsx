"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import LogoutButton from "./LogoutButton";

const NAV_ITEMS = [
  { href: "/home", label: "ホーム" },
  { href: "/requests", label: "希望休" },
] as const;

export default function StaffHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-1">
          <h2 className="text-lg font-bold text-gray-900">NHO シフト管理</h2>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings/password"
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            パスワード変更
          </Link>
          <LogoutButton />
        </div>
      </div>

      <nav className="flex gap-1 px-4 pb-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
