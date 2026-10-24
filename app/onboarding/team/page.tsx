import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  HeartPulse,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';

import {
  skipOnboardingTeamAction,
  verifyOnboardingTeamAction,
} from '@/app/onboarding/actions';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type Membership = {
  user_id: string;
  role: string;
  active: boolean;
};

type Profile = {
  id: string;
  full_name: string | null;
  active: boolean;
};

const steps = [
  ['business', 'Business', 'Workspace profile'],
  ['goals', 'Goals', 'What to improve'],
  ['website', 'Website', 'Tracking setup'],
  ['channels', 'Channels', 'Connect sources'],
  ['team', 'Team', 'Invite people'],
  ['finish', 'Finish', 'Readiness review'],
] as const;

function Rail({
  organizationName,
  completedSteps,
}: {
  organizationName: string;
  completedSteps: Set<string>;
}) {
  return (
    <aside className="border-b border-[#dfe9e2] bg-[#123f33] px-5 py-5 text-white lg:min-h-screen lg:w-[300px] lg:border-b-0 lg:border-r lg:px-7 lg:py-8">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[11px] font-black tracking-[-0.03em] text-[#174d3d]">SO</div>
        <div>
          <div className="text-sm font-bold">SalsysOS</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-[#9ec7b7]">Workspace setup</div>
        </div>
      </div>

      <div className="mt-7 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9ec7b7]">Setting up</div>
        <div className="mt-1 truncate text-sm font-bold">{organizationName}</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#8de0b7]"
            style={{ width: `${Math.max(8, (completedSteps.size / 6) * 100)}%` }}
          />
        </div>
        <div className="mt-2 text-[10.5px] text-[#b7d6ca]">
          {completedSteps.size} of 6 setup steps complete
        </div>
      </div>

      <nav className="mt-5 hidden space-y-1 lg:block" aria-label="Onboarding progress">
        {steps.map(([key, label, description], index) => {
          const complete = completedSteps.has(key);
          const active = key === 'team';
          return (
            <div
              key={key}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 ${active ? 'bg-white text-[#153e32]' : 'text-[#c3dcd2]'}`}
            >
              <div
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[10px] font-bold ${
                  complete
                    ? 'border-[#78d7ab] bg-[#78d7ab] text-[#113f31]'
                    : active
                      ? 'border-[#b7d9c9] bg-[#edf7f1] text-[#23654f]'
                      : 'border-white/15 bg-white/5 text-[#a8c8bc]'
                }`}
              >
                {complete ? <Check size={13} /> : index + 1}
              </div>
              <div>
                <div className="text-[11.5px] font-bold">{label}</div>
                <div className={`text-[10px] ${active ? 'text-[#6d8278]' : 'text-[#83aa9b]'}`}>
                  {description}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mt-5 flex items-center justify-between lg:hidden">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-[#9ec7b7]">Step 5 of 6</div>
          <div className="mt-1 text-sm font-bold">Team</div>
        </div>
        <div className="text-[11px] text-[#b7d6ca]">{completedSteps.size} complete</div>
      </div>

      <div className="mt-8 hidden rounded-xl border border-white/10 bg-white/5 p-4 lg:block">
        <div className="flex gap-2 text-[11px] font-bold text-[#d9ebe4]">
          <ShieldCheck size={15} className="text-[#85d7ae]" /> Real tenant membership
        </div>
        <p className="mt-2 text-[10.5px] leading-5 text-[#9fc1b4]">
          Team completion is based on an active employee profile and active organization membership. Creating a placeholder does not count.
        </p>
      </div>
    </aside>
  );
}

export default async function OnboardingTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const workspace = await getCurrentWorkspaceContext(supabase);
  const organizationId = workspace.activeOrganizationId;
  const organizationName = workspace.activeWorkspace?.organizationName || 'Your workspace';

  if (!organizationId) redirect('/dashboard');

  const [{ data: canManage }, { data: onboarding }] = await Promise.all([
    supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
    supabase
      .from('organization_onboarding')
      .select('completed_steps')
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ]);

  if (!canManage) redirect('/dashboard');

  const completedSteps = new Set(
    Array.isArray(onboarding?.completed_steps)
      ? onboarding.completed_steps.map(String)
      : [],
  );

  if (!completedSteps.has('business')) redirect('/onboarding?step=business');
  if (!completedSteps.has('goals')) redirect('/onboarding?step=goals');
  if (completedSteps.has('team')) redirect('/onboarding?step=finish');

  const admin = createAdminClient();
  const { data: memberships, error: membershipError } = await admin
    .from('organization_members')
    .select('user_id,role,active')
    .eq('organization_id', organizationId)
    .in('role', ['owner', 'admin', 'admissions']);

  if (membershipError) {
    throw new Error(`Unable to load onboarding team: ${membershipError.message}`);
  }

  const typedMemberships = (memberships ?? []) as Membership[];
  const userIds = typedMemberships.map((membership) => membership.user_id);
  const { data: profiles, error: profileError } = userIds.length
    ? await admin
        .from('profiles')
        .select('id,full_name,active')
        .in('id', userIds)
    : { data: [] as Profile[], error: null };

  if (profileError) {
    throw new Error(`Unable to load onboarding team profiles: ${profileError.message}`);
  }

  const typedProfiles = (profiles ?? []) as Profile[];
  const profileById = new Map(typedProfiles.map((profile) => [profile.id, profile]));
  const employeeMemberships = typedMemberships.filter(
    (membership) => membership.role === 'admissions',
  );
  const activeEmployees = employeeMemberships.filter((membership) => {
    const profile = profileById.get(membership.user_id);
    return membership.active && profile?.active === true;
  });

  return (
    <main className="min-h-screen bg-[#f5f8f6] text-[#173d32] lg:flex">
      <Rail organizationName={organizationName} completedSteps={completedSteps} />

      <section className="min-w-0 flex-1">
        <div className="border-b border-[#e2ebe5] bg-white/80 px-5 py-3 backdrop-blur sm:px-8">
          <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4">
            <div className="text-[10.5px] font-bold text-[#72877c]">Workspace onboarding</div>
            <div className="flex items-center gap-2 text-[10.5px] text-[#82958b]">
              <HeartPulse size={13} className="text-[#3c8b68]" /> Live membership state
            </div>
          </div>
        </div>

        <div className="px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          <div className="mx-auto w-full max-w-[900px]">
            {query.error ? (
              <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium leading-5 text-rose-800">
                {query.error}
              </div>
            ) : null}

            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#779184]">Step 5 · Team</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.04em] text-[#153e32] sm:text-[36px]">
              Bring your sales team into the workspace.
            </h1>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#657b70]">
              SalsysOS checks the existing Team & Access system. Add at least one active employee to complete this step, or continue solo without marking Team complete.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#dce7df] bg-white p-5 shadow-[0_3px_14px_rgba(25,66,51,0.035)]">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#80958a]">Employees</div>
                <div className="mt-2 text-3xl font-bold tracking-[-0.04em] text-[#173f33]">{employeeMemberships.length}</div>
                <div className="mt-1 text-[10.8px] leading-5 text-[#74877d]">Employee memberships in this organization.</div>
              </div>
              <div className="rounded-2xl border border-[#dce7df] bg-white p-5 shadow-[0_3px_14px_rgba(25,66,51,0.035)]">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#80958a]">Active employees</div>
                <div className="mt-2 text-3xl font-bold tracking-[-0.04em] text-[#173f33]">{activeEmployees.length}</div>
                <div className="mt-1 text-[10.8px] leading-5 text-[#74877d]">Active profile + active tenant membership.</div>
              </div>
              <div className="rounded-2xl border border-[#dce7df] bg-white p-5 shadow-[0_3px_14px_rgba(25,66,51,0.035)]">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#80958a]">Status</div>
                <div className={`mt-2 text-sm font-bold ${activeEmployees.length ? 'text-[#27845b]' : 'text-[#6e7f76]'}`}>
                  {activeEmployees.length ? 'Ready to continue' : 'Solo setup'}
                </div>
                <div className="mt-2 text-[10.8px] leading-5 text-[#74877d]">
                  {activeEmployees.length
                    ? 'At least one employee can access the Sales workspace.'
                    : 'No active employee has been provisioned yet.'}
                </div>
              </div>
            </div>

            <section className="mt-5 rounded-2xl border border-[#dce7df] bg-white p-5 shadow-[0_8px_30px_rgba(25,66,51,0.045)] sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#eef7f2] text-[#286c53]">
                    <UserPlus size={19} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#183f33]">Team & Access</h2>
                    <p className="mt-1 max-w-xl text-[11px] leading-5 text-[#6d8176]">
                      Use the existing admin screen to create an employee login. That flow provisions authentication, tenant membership and Sales workspace access together.
                    </p>
                  </div>
                </div>
                <Link
                  href="/settings/team"
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#cfe1d6] bg-[#f8fbf9] px-4 text-xs font-bold text-[#276b51]"
                >
                  Manage team <ArrowRight size={13} />
                </Link>
              </div>

              <div className="mt-5 border-t border-[#edf1ee] pt-4">
                {activeEmployees.length ? (
                  <div className="space-y-2">
                    {activeEmployees.slice(0, 5).map((membership) => {
                      const profile = profileById.get(membership.user_id);
                      return (
                        <div key={membership.user_id} className="flex items-center justify-between gap-3 rounded-xl border border-[#e4ebe6] bg-[#fafcfb] px-3.5 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#edf7f1] text-[#2f7658]">
                              <Users size={15} />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-[11.5px] font-bold text-[#345548]">{profile?.full_name ?? 'Employee'}</div>
                              <div className="text-[10px] text-[#7e9187]">Sales employee · active</div>
                            </div>
                          </div>
                          <CheckCircle2 size={17} className="shrink-0 text-[#2f9a6a]" />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#cfdcd4] bg-[#fafcfb] p-5 text-center">
                    <div className="text-[11.5px] font-bold text-[#4f675b]">No active employees yet</div>
                    <div className="mt-1 text-[10.8px] leading-5 text-[#83948b]">You can add one now, or continue as a solo operator and return later.</div>
                  </div>
                )}
              </div>
            </section>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link href="/onboarding/channels" className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[#657c70]">
                <ArrowLeft size={13} /> Back to channels
              </Link>
              <div className="flex flex-wrap gap-2">
                <form action={skipOnboardingTeamAction}>
                  <button type="submit" className="h-10 rounded-lg border border-[#d7e2db] bg-white px-4 text-xs font-bold text-[#657c70]">
                    I’m working solo for now
                  </button>
                </form>
                <form action={verifyOnboardingTeamAction}>
                  <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1f654e] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#185640]">
                    Verify team & continue <ArrowRight size={14} />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
