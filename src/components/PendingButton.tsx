"use client";

import { useFormStatus } from "react-dom";

/** Submit button that disables itself and shows `pendingLabel` while the form is being sent. */
export function PendingButton({ label, pendingLabel, className = "btn-primary", disabled }: { label: string; pendingLabel: string; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending || disabled ? pendingLabel : label}
    </button>
  );
}
