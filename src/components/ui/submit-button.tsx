"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Submit button for server-action forms: shows the loading state while the
 * enclosing `<form action={…}>` is pending, so the user never clicks twice
 * wondering whether anything happened (docs/ui/AUDIT.md §4.6).
 */
export function SubmitButton({ loading, ...props }: Omit<ButtonProps, "type">) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="primary" loading={loading || pending} {...props} />;
}
