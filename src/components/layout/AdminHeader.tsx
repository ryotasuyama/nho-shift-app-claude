import LogoutButton from "./LogoutButton";

export default function AdminHeader() {
  return (
    <header className="flex h-14 items-center justify-end border-b border-gray-200 bg-white px-6">
      <LogoutButton />
    </header>
  );
}
