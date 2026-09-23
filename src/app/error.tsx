"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with a real error reporter when one is added.
    console.error("[app] route error", error);
  }, [error]);

  return (
    <ErrorState
      detail={error.digest ? `${error.message}\ndigest: ${error.digest}` : error.message}
      actions={
        <>
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/" variant="secondary">
            Back to dashboard
          </ButtonLink>
        </>
      }
    />
  );
}
