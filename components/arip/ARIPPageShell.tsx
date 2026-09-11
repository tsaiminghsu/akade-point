interface ARIPPageShellProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function ARIPPageShell({ title, description, actions, children }: ARIPPageShellProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-gray-400">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
