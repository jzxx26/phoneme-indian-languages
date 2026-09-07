import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">{children}</h2>;
}
