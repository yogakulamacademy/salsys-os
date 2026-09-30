import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

import {
  createEmployeeAction,
  setEmployeeActiveAction,
} from './actions';


type TeamProfile = {
  id: string;
  full_name: string | null;
  role: string;
  active: boolean;
};


export default async function TeamAccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    error?: string;
  }>;
}) {
  const query =
    await searchParams;

  const supabase =
    await createClient();

  const {
    data: {
      user,
    },
    error: authError,
  } =
    await supabase.auth.getUser();

  if (
    authError ||
    !user
  ) {
    redirect('/login');
  }

  const {
    data: currentProfile,
    error: currentProfileError,
  } =
    await supabase
      .from('profiles')
      .select(
        'id, full_name, role, active'
      )
      .eq(
        'id',
        user.id
      )
      .maybeSingle();

  if (
    currentProfileError ||
    !currentProfile ||
    currentProfile.active !== true ||
    currentProfile.role !== 'admin'
  ) {
    redirect('/dashboard');
  }

  const admin =
    createAdminClient();

  const [
    profilesResult,
    authUsersResult,
  ] =
    await Promise.all([
      admin
        .from('profiles')
        .select(
          'id, full_name, role, active'
        )
        .in(
          'role',
          [
            'admin',
            'admissions',
          ]
        )
        .order(
          'full_name',
          {
            ascending:
              true,
          }
        ),

      admin
        .auth
        .admin
        .listUsers({
          page:
            1,
          perPage:
            200,
        }),
    ]);

  if (
    profilesResult.error
  ) {
    throw new Error(
      `Unable to load CRM team: ${profilesResult.error.message}`
    );
  }

  const profiles =
    (
      profilesResult.data ??
      []
    ) as TeamProfile[];

  const emailById =
    new Map(
      (
        authUsersResult
          .data
          .users ??
        []
      )
        .map(
          (
            authUser
          ) =>
            [
              authUser.id,
              authUser.email ??
                '—',
            ] as const
        )
    );

  const employees =
    profiles
      .filter(
        (
          profile
        ) =>
          profile.role ===
          'admissions'
      );

  const activeEmployees =
    employees
      .filter(
        (
          employee
        ) =>
          employee.active
      )
      .length;

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Team & Access"
        description="Create Employee logins and control whether staff accounts can access the CRM."
        actions={
          <Link
            href="/settings"
            className="btn-secondary"
          >
            <ArrowLeft
              size={16}
            />
            Settings
          </Link>
        }
      />

      {query.notice ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {query.notice}
        </div>
      ) : null}

      {query.error ? (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {query.error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={
            <Users
              size={18}
            />
          }
          label="Employees"
          value={
            employees.length
          }
          detail="Employee role is stored internally as admissions."
        />

        <SummaryCard
          icon={
            <BadgeCheck
              size={18}
            />
          }
          label="Active employees"
          value={
            activeEmployees
          }
          detail="Only active employees are eligible for lead assignment."
        />

        <SummaryCard
          icon={
            <ShieldCheck
              size={18}
            />
          }
          label="Access model"
          value="Protected"
          detail="Admin has full access. Employees are being restricted to assigned leads."
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="text-sm font-bold text-slate-900">
              Team members
            </div>

            <div className="mt-1 text-xs leading-5 text-slate-500">
              Employee accounts use the existing admissions role internally. Admin accounts remain separate.
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[.1em] text-slate-400">
                    Team member
                  </th>

                  <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[.1em] text-slate-400">
                    Role
                  </th>

                  <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[.1em] text-slate-400">
                    Status
                  </th>

                  <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-[.1em] text-slate-400">
                    Access
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {profiles.map(
                  (
                    profile
                  ) => {
                    const isAdmin =
                      profile.role ===
                      'admin';

                    return (
                      <tr
                        key={
                          profile.id
                        }
                        className="hover:bg-slate-50/70"
                      >
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-900">
                            {profile.full_name ??
                              'CRM User'}
                          </div>

                          <div className="mt-0.5 text-xs text-slate-500">
                            {emailById.get(
                              profile.id
                            ) ??
                              '—'}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={
                              isAdmin
                                ? 'inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700'
                                : 'inline-flex rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700'
                            }
                          >
                            {isAdmin
                              ? 'Admin'
                              : 'Employee'}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={
                              profile.active
                                ? 'inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700'
                                : 'inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500'
                            }
                          >
                            {profile.active
                              ? 'Active'
                              : 'Inactive'}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right">
                          {isAdmin ? (
                            <span className="text-xs font-semibold text-slate-400">
                              Full access
                            </span>
                          ) : (
                            <form
                              action={
                                setEmployeeActiveAction
                              }
                              className="inline-flex"
                            >
                              <input
                                type="hidden"
                                name="employee_id"
                                value={
                                  profile.id
                                }
                              />

                              <input
                                type="hidden"
                                name="active"
                                value={
                                  profile.active
                                    ? 'false'
                                    : 'true'
                                }
                              />

                              <button
                                type="submit"
                                className="btn-secondary"
                              >
                                {profile.active
                                  ? 'Deactivate'
                                  : 'Activate'}
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card-pad self-start">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <UserPlus
                size={19}
              />
            </div>

            <div>
              <div className="font-bold text-slate-900">
                Add Employee
              </div>

              <div className="text-xs text-slate-500">
                Creates Supabase Auth + CRM profile.
              </div>
            </div>
          </div>

          <form
            action={
              createEmployeeAction
            }
            className="mt-5 space-y-4"
          >
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-600">
                Full name
              </span>

              <input
                required
                name="full_name"
                type="text"
                autoComplete="off"
                placeholder="Employee name"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-600">
                Login email
              </span>

              <input
                required
                name="email"
                type="email"
                autoComplete="off"
                placeholder="employee@example.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-600">
                Temporary password
              </span>

              <input
                required
                name="password"
                type="password"
                minLength={10}
                autoComplete="new-password"
                placeholder="Minimum 10 characters"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand"
              />
            </label>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-500">
              Role will be <strong>Employee</strong>. Internally the CRM stores this as <code>admissions</code> so the existing admissions workflows remain compatible.
            </div>

            <button
              type="submit"
              className="btn-primary w-full justify-center"
            >
              <UserPlus
                size={16}
              />
              Create employee
            </button>
          </form>
        </section>
      </div>
    </>
  );
}


function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon:
    React.ReactNode;
  label:
    string;
  value:
    React.ReactNode;
  detail:
    string;
}) {
  return (
    <section className="card-pad">
      <div className="flex items-center gap-2 text-brand">
        {icon}

        <span className="text-xs font-bold uppercase tracking-[.08em] text-slate-400">
          {label}
        </span>
      </div>

      <div className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">
        {value}
      </div>

      <div className="mt-2 text-xs leading-5 text-slate-500">
        {detail}
      </div>
    </section>
  );
}
