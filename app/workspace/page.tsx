"use client";

import { useEffect, useState } from "react";

type WorkspaceMembership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
};

type WorkspaceContext = {
  activeOrganizationId: string | null;
  activeWorkspace: WorkspaceMembership | null;
  memberships: WorkspaceMembership[];
  selectionRequired: boolean;
};

function destinationAfterSelection() {
  if (typeof window === "undefined") {
    return "/dashboard";
  }

  const requested =
    new URLSearchParams(window.location.search)
      .get("next")
      ?.trim() ?? "";

  if (
    requested.startsWith("/") &&
    !requested.startsWith("//") &&
    !requested.startsWith("/workspace")
  ) {
    return requested;
  }

  return "/dashboard";
}

export default function WorkspacePage() {
  const [workspace, setWorkspace] =
    useState<WorkspaceContext | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [switchingId, setSwitchingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  async function selectWorkspace(
    organizationId: string,
  ) {
    if (!organizationId || switchingId) {
      return;
    }

    setSwitchingId(organizationId);
    setError(null);

    try {
      const response =
        await fetch("/api/workspace", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId,
          }),
        });

      const body =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error ||
            "Unable to select workspace.",
        );
      }

      window.location.replace(
        destinationAfterSelection(),
      );
    } catch (selectionError) {
      setSwitchingId(null);

      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "Unable to select workspace.",
      );
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const response =
          await fetch("/api/workspace", {
            cache: "no-store",
          });

        if (response.status === 401) {
          window.location.replace(
            "/login?next=/workspace",
          );
          return;
        }

        const body =
          (await response
            .json()
            .catch(() => null)) as
            | WorkspaceContext
            | { error?: string }
            | null;

        if (!response.ok) {
          throw new Error(
            body &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : "Unable to load workspaces.",
          );
        }

        const context =
          body as WorkspaceContext;

        if (cancelled) {
          return;
        }

        setWorkspace(context);
        setLoading(false);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load workspaces.",
        );

        setLoading(false);
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-4xl items-center justify-center px-4 py-12">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-7">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            Workspace
          </div>

          <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">
            Choose your workspace
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Select the organization you want to work in.
            Your CRM data and permissions remain isolated
            to the selected workspace.
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-6 text-sm font-medium text-slate-500">
            Loading your workspaces...
          </div>
        )}

        {!loading &&
          workspace &&
          workspace.memberships.length === 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6">
              <div className="font-semibold text-amber-900">
                No active workspace found
              </div>

              <p className="mt-1 text-sm leading-6 text-amber-700">
                Your account is authenticated, but it does
                not currently have an active organization
                membership.
              </p>
            </div>
          )}

        {!loading &&
          workspace &&
          workspace.memberships.length > 0 && (
            <div className="grid gap-3">
              {workspace.memberships.map(
                (membership) => {
                  const switching =
                    switchingId ===
                    membership.organizationId;

                  return (
                    <button
                      key={
                        membership.organizationId
                      }
                      type="button"
                      disabled={
                        Boolean(switchingId)
                      }
                      onClick={() =>
                        void selectWorkspace(
                          membership.organizationId,
                        )
                      }
                      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-5 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      <span>
                        <span className="block font-semibold text-slate-950">
                          {
                            membership.organizationName
                          }
                        </span>

                        <span className="mt-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                          {membership.role ||
                            "Member"}
                        </span>
                      </span>

                      <span className="text-sm font-semibold text-slate-500">
                        {switching
                          ? "Opening..."
                          : "Continue →"}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          )}
      </section>
    </main>
  );
}