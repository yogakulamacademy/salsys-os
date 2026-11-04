import { notFound } from "next/navigation";

import { LeadsImportClient } from "@/components/leads/leads-import-client";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import { getLeadsTransferPermissions } from "@/lib/leads-transfer-permissions";
import { isMockMode } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ImportLeadsPage() {
  const mock = isMockMode();

  if (!mock) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) notFound();

    let organizationId: string;
    try {
      organizationId = await requireCurrentOrganizationId(supabase, user.id);
    } catch {
      notFound();
    }

    const permissions = await getLeadsTransferPermissions(supabase, user.id, organizationId);
    if (!permissions.canImport) notFound();
  }

  return (
    <>
      {mock ? (
        <div role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Demo mode is active. You can preview a CSV file, but no leads will be saved.
        </div>
      ) : null}
      <LeadsImportClient enabled={!mock} />
    </>
  );
}
