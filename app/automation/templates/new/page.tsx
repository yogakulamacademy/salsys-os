import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TemplateAuthoringStudio } from '@/app/automation/templates/new/template-authoring-studio';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export default async function NewWhatsAppTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; preview?: string }>;
}) {
  // An authenticated admin can inspect the frontend with no database or provider writes.
  const params = await searchParams;
  const studioEnabled = process.env.WA_TEMPLATE_STUDIO_ENABLED === 'true';
  const previewMode = !studioEnabled && params.preview === '1';
  if (!studioEnabled && !previewMode) notFound();
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

  const draftId = !previewMode && typeof params.draft === 'string' && /^[0-9a-f-]{36}$/i.test(params.draft)
    ? params.draft : null;
  return (
    <TemplateAuthoringStudio
      initialDraftId={draftId}
      previewMode={previewMode}
      submissionEnabled={!previewMode && process.env.WA_TEMPLATE_AUTHORING_ENABLED === 'true'}
    />
  );
}
