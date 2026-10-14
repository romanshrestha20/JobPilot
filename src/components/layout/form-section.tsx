import type * as React from "react";

export interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

/** A titled group of fields inside a form. */
export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">{title}</h2>
        {description ? <p className="text-body-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
