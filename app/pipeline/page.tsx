import { PipelineWorkspace } from "@/components/crm/pipeline-workspace";
import { getPipelineSnapshot } from "@/lib/pipeline-data";

export default async function PipelinePage() {
  const snapshot = await getPipelineSnapshot();
  return <PipelineWorkspace snapshot={snapshot} />;
}
