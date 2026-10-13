import { notFound, redirect } from "next/navigation";

import {
  getFunctionalWorkspaceDefinition,
  getFunctionalWorkspaceRootPath,
} from "@/lib/functional-workspaces";
import { getCurrentWorkspaceContext } from "@/lib/workspace";

type FunctionalWorkspacePageProps = {
  params: Promise<{
    workspace: string;
  }>;
};

export default async function FunctionalWorkspacePage({
  params,
}: FunctionalWorkspacePageProps) {
  const { workspace: requestedWorkspace } = await params;
  const definition = getFunctionalWorkspaceDefinition(requestedWorkspace);

  if (!definition) {
    notFound();
  }

  const context = await getCurrentWorkspaceContext();

  if (!context.activeOrganizationId) {
    redirect(
      `/workspace?next=${encodeURIComponent(definition.rootPath)}`,
    );
  }

  const grantedWorkspace = context.functionalWorkspaces.find(
    (workspace) => workspace.code === definition.code,
  );

  if (!grantedWorkspace) {
    const fallbackWorkspace = context.functionalWorkspaces[0];

    if (fallbackWorkspace) {
      const fallbackRootPath = getFunctionalWorkspaceRootPath(
        fallbackWorkspace.code,
      );

      if (fallbackRootPath) {
        redirect(`${fallbackRootPath}?restricted=1`);
      }
    }

    redirect("/login?error=workspace-not-authorized");
  }

  redirect(definition.landingPath);
}
