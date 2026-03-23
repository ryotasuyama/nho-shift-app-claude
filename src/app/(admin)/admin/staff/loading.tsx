export default function StaffLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded bg-gray-200" />
        <div className="h-10 w-24 rounded bg-gray-200" />
      </div>
      <div className="flex gap-3">
        <div className="h-9 w-48 rounded bg-gray-200" />
        <div className="h-9 w-28 rounded bg-gray-200" />
        <div className="h-9 w-28 rounded bg-gray-200" />
      </div>
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 rounded bg-gray-200" />
        ))}
      </div>
    </div>
  );
}
