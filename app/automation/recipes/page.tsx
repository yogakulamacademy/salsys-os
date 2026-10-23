import { StarterRecipesGallery } from '@/app/automation/recipes/starter-recipes-gallery';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type WorkflowRow = {
  id: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  metadata: Record<string, unknown> | null;
};

export default async function AutomationRecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="card-pad text-sm text-slate-600">Sign in to use starter recipes.</div>;
  }

  let organizationName = 'Current organization';
  let canManage = false;
  let installedRecipes: Array<{
    key: string;
    workflowId: string;
    status: 'draft' | 'active' | 'paused' | 'archived';
  }> = [];
  let loadError: string | null = null;

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const [
        { data: manageData, error: manageError },
        { data: workflowRows, error: workflowError },
      ] = await Promise.all([
        supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
        supabase
          .from('automation_workflows')
          .select('id,status,metadata')
          .eq('organization_id', organizationId)
          .neq('status', 'archived')
          .order('updated_at', { ascending: false }),
      ]);

      if (manageError || workflowError) throw manageError || workflowError;
      canManage = manageData === true;

      installedRecipes = ((workflowRows ?? []) as WorkflowRow[])
        .map((row) => {
          const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
          const key = typeof metadata.recipe_key === 'string' ? metadata.recipe_key : '';
          return key ? { key, workflowId: row.id, status: row.status } : null;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load starter recipes.';
  }

  return (
    <div className="space-y-4">
      {query.notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {query.notice}
        </div>
      ) : null}
      {query.error || loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {query.error || loadError}
        </div>
      ) : null}

      <StarterRecipesGallery
        organizationName={organizationName}
        installedRecipes={installedRecipes}
        canManage={canManage}
      />
    </div>
  );
}
