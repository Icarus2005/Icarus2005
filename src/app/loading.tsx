export default function Loading() {
  return (
    <div className="p-8 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-56 bg-gray-200 rounded-lg mb-2" />
      <div className="h-4 w-80 bg-gray-100 rounded mb-6" />
      <div className="h-10 w-[560px] max-w-full bg-gray-100 rounded-xl mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-white border border-gray-100 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-72 bg-white border border-gray-100 rounded-2xl lg:col-span-2" />
        <div className="h-72 bg-white border border-gray-100 rounded-2xl" />
      </div>
    </div>
  );
}
