'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';


function value(
  formData: FormData,
  key: string
) {
  return String(
    formData.get(key) ?? ''
  ).trim();
}


function teamUrl(
  key: 'notice' | 'error',
  message: string
) {
  const params =
    new URLSearchParams({
      [key]: message,
    });

  return `/settings/team?${params.toString()}`;
}


async function requireAdmin() {
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
    data: profile,
    error: profileError,
  } =
    await supabase
      .from('profiles')
      .select(
        'id, role, active'
      )
      .eq(
        'id',
        user.id
      )
      .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.active !== true ||
    profile.role !== 'admin'
  ) {
    redirect('/dashboard');
  }

  return user;
}


export async function createEmployeeAction(
  formData: FormData
) {
  await requireAdmin();

  const fullName =
    value(
      formData,
      'full_name'
    );

  const email =
    value(
      formData,
      'email'
    )
      .toLowerCase();

  const password =
    value(
      formData,
      'password'
    );

  if (
    fullName.length < 2
  ) {
    redirect(
      teamUrl(
        'error',
        'Employee name is required.'
      )
    );
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    redirect(
      teamUrl(
        'error',
        'Enter a valid employee email address.'
      )
    );
  }

  if (
    password.length < 10
  ) {
    redirect(
      teamUrl(
        'error',
        'Temporary password must be at least 10 characters.'
      )
    );
  }

  const admin =
    createAdminClient();

  const {
    data: created,
    error: createError,
  } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name:
          fullName,
        crm_role:
          'admissions',
      },
    });

  if (
    createError ||
    !created.user
  ) {
    redirect(
      teamUrl(
        'error',
        createError?.message ??
          'Unable to create employee login.'
      )
    );
  }

  const userId =
    created.user.id;

  const {
    error: profileError,
  } =
    await admin
      .from('profiles')
      .insert({
        id:
          userId,
        full_name:
          fullName,
        role:
          'admissions',
        active:
          true,
      });

  if (
    profileError
  ) {
    /*
     * Avoid leaving an Auth account behind
     * without a matching CRM profile.
     */
    await admin
      .auth
      .admin
      .deleteUser(
        userId
      );

    redirect(
      teamUrl(
        'error',
        `Employee login was rolled back because the CRM profile could not be created: ${profileError.message}`
      )
    );
  }

  revalidatePath(
    '/settings/team'
  );

  revalidatePath(
    '/admissions'
  );

  redirect(
    teamUrl(
      'notice',
      `${fullName} was created as an Employee.`
    )
  );
}


export async function setEmployeeActiveAction(
  formData: FormData
) {
  const adminUser =
    await requireAdmin();

  const employeeId =
    value(
      formData,
      'employee_id'
    );

  const nextActive =
    value(
      formData,
      'active'
    ) === 'true';

  if (
    !employeeId
  ) {
    redirect(
      teamUrl(
        'error',
        'Employee is missing.'
      )
    );
  }

  if (
    employeeId ===
      adminUser.id
  ) {
    redirect(
      teamUrl(
        'error',
        'You cannot deactivate your own admin account here.'
      )
    );
  }

  const admin =
    createAdminClient();

  const {
    data: target,
    error: targetError,
  } =
    await admin
      .from('profiles')
      .select(
        'id, full_name, role'
      )
      .eq(
        'id',
        employeeId
      )
      .maybeSingle();

  if (
    targetError ||
    !target
  ) {
    redirect(
      teamUrl(
        'error',
        targetError?.message ??
          'Employee was not found.'
      )
    );
  }

  if (
    target.role !==
      'admissions'
  ) {
    redirect(
      teamUrl(
        'error',
        'Only Employee accounts can be changed from this screen.'
      )
    );
  }

  const {
    error: updateError,
  } =
    await admin
      .from('profiles')
      .update({
        active:
          nextActive,
      })
      .eq(
        'id',
        employeeId
      );

  if (
    updateError
  ) {
    redirect(
      teamUrl(
        'error',
        updateError.message
      )
    );
  }

  revalidatePath(
    '/settings/team'
  );

  revalidatePath(
    '/admissions'
  );

  redirect(
    teamUrl(
      'notice',
      `${target.full_name ?? 'Employee'} is now ${nextActive ? 'active' : 'inactive'}.`
    )
  );
}
