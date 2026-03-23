export default function TermsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded bg-gray-200" />
        <div className="h-10 w-28 rounded bg-gray-200" />
      </div>
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-gray-200" />
        ))}
      </div>
    </div>
  );
}
