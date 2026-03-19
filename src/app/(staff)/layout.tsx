import StaffHeader from "@/components/layout/StaffHeader";

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <StaffHeader />
      <main className="flex-1 bg-gray-50 p-4">{children}</main>
    </div>
  );
}
