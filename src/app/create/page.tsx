import type { Metadata } from "next";
import { CreateWorkflow } from "@/components/create/create-workflow";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Create",
};

export default function CreatePage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Create new video"
        description="Configure the lesson. You can change any of this later."
      />
      <CreateWorkflow />
    </div>
  );
}
