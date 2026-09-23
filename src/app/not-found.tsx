import { ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function NotFound() {
  return (
    <ErrorState
      title="Page not found"
      message="That page does not exist, or the project it pointed to was deleted."
      actions={<ButtonLink href="/">Back to dashboard</ButtonLink>}
    />
  );
}
