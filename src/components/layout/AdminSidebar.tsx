"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const NAV_ITEMS = [
  { href: "/dashboard", label: "ダッシュボード" },
  { href: "/admin/staff", label: "スタッフ管理" },
  { href: "/admin/terms", label: "ターム設定" },
  { href: "/admin/holidays", label: "祝日マスタ" },
  { href: "/admin/audit-logs", label: "操作ログ" },
] as const;

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-4">
        <h2 className="text-lg font-bold text-gray-900">NHO シフト管理</h2>
        <p className="text-xs text-gray-500">管理者</p>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm font-medium",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 px-2 py-3">
        <Link
          href="/settings/password"
          className="block rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
        >
          パスワード変更
        </Link>
      </div>
    </aside>
  );
}
