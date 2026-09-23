"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiClientError, api } from "@/lib/api-client";

export function DeleteProjectButton({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    try {
      await api.projects.remove(projectId);
      router.push("/projects");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Could not delete the project. Please try again.",
      );
      setDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        Delete
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={deleting}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          loading={deleting}
          onClick={handleDelete}
          // Accessible name must start with the visible text so voice control
          // can still target the button by what the user sees.
          aria-label={`Delete permanently: ${projectTitle}`}
        >
          Delete permanently
        </Button>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
