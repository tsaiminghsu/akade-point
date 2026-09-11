interface ARIPComingSoonProps {
  module: string;
  description?: string;
}

export function ARIPComingSoon({ module, description }: ARIPComingSoonProps) {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 text-center">
      <div className="mb-3 rounded-lg bg-cyan-500/10 p-3">
        <div className="h-8 w-8 rounded-md bg-cyan-400/20" />
      </div>
      <h2 className="text-base font-medium text-white">{module}</h2>
      <p className="mt-1 max-w-xs text-sm text-gray-500">
        {description ?? 'This module is scaffolded and ready for implementation.'}
      </p>
      <span className="mt-4 rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-400">
        Coming Soon
      </span>
    </div>
  );
}
