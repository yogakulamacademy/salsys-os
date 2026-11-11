import Link from 'next/link';
import { TemplateAuthoringStudio } from '@/app/automation/templates/new/template-authoring-studio';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export default async function NewWhatsAppTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm">Sign in to create templates.</div>;
  }
  const workspace = await getWorkspaceContextForUser(supabase, user.id);
  if (!workspace.activeWorkspace || !['owner', 'admin'].includes(workspace.activeWorkspace.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm">
        Workspace admin access is required. <Link className="underline" href="/automation/templates">Back to templates</Link>
      </div>
    );
  }

  const params = await searchParams;
  const draftId = typeof params.draft === 'string' && /^[0-9a-f-]{36}$/i.test(params.draft)
    ? params.draft : null;
  return (
    <TemplateAuthoringStudio
      initialDraftId={draftId}
      submissionEnabled={process.env.WA_TEMPLATE_AUTHORING_ENABLED === 'true'}
    />
  );
}
