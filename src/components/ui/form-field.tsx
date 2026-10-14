import type * as React from "react";
import { cn } from "./cn";
import { Label, labelClass } from "./label";

/** Props to spread onto the control so it is labelled, described and flagged invalid. */
export interface FormControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export interface FormFieldProps {
  /** Id of the control; also used to derive the hint and error ids. */
  id: string;
  label: string;
  hint?: string;
  /** Shown below the control and linked via aria-describedby. Write it as a fix, not a complaint. */
  error?: string;
  className?: string;
  children: (control: FormControlProps) => React.ReactNode;
}

function describedBy(id: string, hint?: string, error?: string) {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

export function FormField({ id, label, hint, error, className, children }: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        "aria-describedby": describedBy(id, hint, error),
        "aria-invalid": error ? true : undefined,
      })}
      {hint ? (
        <p id={`${id}-hint`} className="text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface FieldGroupProps {
  id: string;
  legend: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

/** A labelled group of related controls (checkboxes, radios). */
export function FieldGroup({ id, legend, error, className, children }: FieldGroupProps) {
  return (
    <fieldset
      aria-describedby={error ? `${id}-error` : undefined}
      className={cn("flex flex-col gap-2", className)}
    >
      <legend className={labelClass}>{legend}</legend>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
