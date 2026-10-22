import type { ReactNode } from "react";

export function CalculationFormSection({ id, step, title, children }: {
  id: string;
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4 border-t pt-6">
      <h3 id={`${id}-heading`} className="text-lg font-semibold">{step}. {title}</h3>
      {children}
    </section>
  );
}
