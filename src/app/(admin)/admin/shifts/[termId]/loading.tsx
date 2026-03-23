export default function ShiftsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-8 w-56 rounded bg-gray-200" />
        <div className="h-8 w-20 rounded bg-gray-200" />
      </div>
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-9 w-24 rounded bg-gray-200" />
        ))}
      </div>
      <div className="h-[400px] rounded-lg bg-gray-200" />
    </div>
  );
}
