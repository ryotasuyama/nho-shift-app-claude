export default function RequestsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-40 rounded bg-gray-200" />
      <div className="h-10 w-64 rounded bg-gray-200" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 rounded bg-gray-200" />
        ))}
      </div>
    </div>
  );
}
