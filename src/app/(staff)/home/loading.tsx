export default function HomeLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-32 rounded bg-gray-200" />
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-gray-200" />
        ))}
      </div>
    </div>
  );
}
