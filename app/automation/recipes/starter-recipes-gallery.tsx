'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  Inbox,
  ListChecks,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  Workflow,
  X,
} from 'lucide-react';

import { installSmartTriggerRecipeAction } from '@/app/automation/recipes/actions';

type InstalledRecipe = {
  key: string;
  workflowId: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
};

type Category = 'all' | 'leads' | 'messages' | 'payments' | 'pipeline';

type Recipe = {
  key: string;
  category: Exclude<Category, 'all'>;
  categoryLabel: string;
  name: string;
  description: string;
  event: string;
  action: string;
  delay: string;
  useCase: string;
  recommended?: boolean;
  icon: typeof UserPlus;
  iconTone: string;
  details: string;
  outcomes: string[];
  customize: string;
};

const recipes: Recipe[] = [
  {
    key: 'new_lead_response_sla',
    category: 'leads',
    categoryLabel: 'Lead management',
    name: 'New lead response SLA',
    description: 'Make sure every new enquiry gets a timely first follow-up.',
    event: 'New lead created',
    action: 'Create a first-contact task',
    delay: 'Immediately',
    useCase: 'Lead capture → follow-up task',
    recommended: true,
    icon: UserPlus,
    iconTone: 'bg-[#edf6f0] text-[#246a51]',
    details:
      'When a new lead enters SalsysOS, create an internal follow-up task for the team. No customer message is sent by this recipe.',
    outcomes: [
      'New leads receive a clear internal follow-up task',
      'The workflow starts as a draft with runtime off',
      'You can extend the journey later in Flow Builder',
    ],
    customize:
      'Task title, ownership, timing, conditions, waits, branches and approval rules can be refined in Flow Builder.',
  },
  {
    key: 'inbound_message_review',
    category: 'messages',
    categoryLabel: 'Conversations',
    name: 'Inbound message review',
    description: 'Prompt your team to review and answer new customer messages.',
    event: 'Inbound message received',
    action: 'Create a reply and review task',
    delay: 'Immediately',
    useCase: 'Inbound message → reply task',
    icon: Inbox,
    iconTone: 'bg-[#edf6fc] text-[#3f7fa2]',
    details:
      'When an inbound customer message is recorded, create an internal review task so a team member can respond manually.',
    outcomes: [
      'New inbound conversations are surfaced for review',
      'Customer messaging stays under human control',
      'The installed draft can be extended with approved messaging later',
    ],
    customize:
      'Task ownership, timing, approved messaging, waits, branching and human approvals can be added in Flow Builder.',
  },
  {
    key: 'payment_pending_followup',
    category: 'payments',
    categoryLabel: 'Payments',
    name: 'Payment pending follow-up',
    description: 'Create a controlled follow-up task after a payment has been pending for one hour.',
    event: 'Payment pending',
    action: 'Create payment follow-up task',
    delay: 'After 60 minutes',
    useCase: 'Payment pending → admissions follow-up',
    icon: CreditCard,
    iconTone: 'bg-[#fff5e9] text-[#ae762f]',
    details:
      'When a payment enters the pending state, the recipe schedules an internal follow-up task with a 60-minute delay.',
    outcomes: [
      'Pending-payment follow-ups are less likely to be forgotten',
      'The task is delayed to avoid an immediate interruption',
      'The draft can be extended with additional checks in Flow Builder',
    ],
    customize:
      'You can add additional conditions, payment-state checks, task ownership and approval logic in Flow Builder before activation.',
  },
  {
    key: 'lead_stage_change_review',
    category: 'pipeline',
    categoryLabel: 'Pipeline',
    name: 'Lead stage change review',
    description: 'Keep pipeline transitions visible with an internal review task.',
    event: 'Lead stage changed',
    action: 'Create a stage-review task',
    delay: 'Immediately',
    useCase: 'Pipeline change → review task',
    icon: Workflow,
    iconTone: 'bg-[#f3f1fc] text-[#7d68b6]',
    details:
      'When a CRM lead changes stage, create an internal review task so the team can confirm the next action.',
    outcomes: [
      'Stage changes stay visible to the team',
      'Handoffs receive a clear internal review step',
      'The draft can be expanded into a more detailed journey',
    ],
    customize: 'Add stage-specific branches, owners, waits and approvals in Flow Builder after installation.',
  },
];

const categories: { key: Category; label: string }[] = [
  { key: 'all', label: 'All recipes' },
  { key: 'leads', label: 'Lead management' },
  { key: 'messages', label: 'Conversations' },
  { key: 'payments', label: 'Payments' },
  { key: 'pipeline', label: 'Pipeline' },
];

function statusLabel(status: InstalledRecipe['status']) {
  if (status === 'draft') return 'Draft · Inactive';
  if (status === 'paused') return 'Paused';
  if (status === 'active') return 'Active';
  return 'Archived';
}

export function StarterRecipesGallery({
  organizationName,
  installedRecipes,
  canManage,
}: {
  organizationName: string;
  installedRecipes: InstalledRecipe[];
  canManage: boolean;
}) {
  const [mode, setMode] = useState<'gallery' | 'recipes'>('gallery');
  const [category, setCategory] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [installKey, setInstallKey] = useState<string | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);

  const installedMap = useMemo(
    () => new Map(installedRecipes.map((item) => [item.key, item])),
    [installedRecipes],
  );

  const visibleRecipes = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return recipes.filter((recipe) => {
      const categoryMatches = category === 'all' || recipe.category === category;
      const searchMatches =
        !needle ||
        [
          recipe.name,
          recipe.description,
          recipe.categoryLabel,
          recipe.event,
          recipe.action,
          recipe.useCase,
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle);
      return categoryMatches && searchMatches;
    });
  }, [category, search]);

  const selectedRecipe = recipes.find((recipe) => recipe.key === previewKey) ?? null;
  const pendingInstall = recipes.find((recipe) => recipe.key === installKey) ?? null;
  const installedCatalog = recipes.filter((recipe) => installedMap.has(recipe.key));
  const overlayOpen = Boolean(selectedRecipe || pendingInstall || safetyOpen);

  useEffect(() => {
    if (!overlayOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (pendingInstall) {
        setInstallKey(null);
        return;
      }
      if (safetyOpen) {
        setSafetyOpen(false);
        return;
      }
      if (selectedRecipe) setPreviewKey(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [overlayOpen, pendingInstall, safetyOpen, selectedRecipe]);

  function openInstall(recipeKey: string) {
    if (installedMap.has(recipeKey) || !canManage) return;
    setInstallKey(recipeKey);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8ca195]">
            Automation / Build
          </div>
          <h1 className="mt-1 text-[28px] font-bold tracking-[-0.04em] text-[#163e33]">
            Starter Recipes
          </h1>
          <p className="mt-1.5 max-w-3xl text-[12.5px] text-[#698176]">
            Start with ready-made automation templates for {organizationName}. Preview how they work,
            install safely as drafts, then customize in Flow Builder.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={mode === 'recipes'}
            onClick={() => setMode((current) => (current === 'recipes' ? 'gallery' : 'recipes'))}
            className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-[#dee8e1] bg-white px-3 text-xs font-bold text-[#163e33] hover:bg-[#f8fbf8]"
          >
            <FileText size={14} /> My recipes
            <span className="rounded-md bg-[#edf4ef] px-1.5 py-0.5 text-[10px] text-[#4f7463]">
              {installedCatalog.length}
            </span>
          </button>
          <Link
            href="/automation/flow-builder"
            className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-[#dee8e1] bg-white px-3 text-xs font-bold text-[#163e33] hover:bg-[#f8fbf8]"
          >
            Open Flow Builder <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <section className="flex items-start gap-3 rounded-[12px] border border-[#cbead8] bg-[#f0faf4] px-4 py-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[#dcf4e5] text-[#15986c]">
          <ShieldCheck size={17} />
        </div>
        <div className="min-w-0">
          <div className="text-[12.5px] font-bold text-[#234c3b]">
            Safe by default — nothing goes live automatically
          </div>
          <p className="mt-0.5 text-[11.5px] leading-5 text-[#3f785f]">
            Recipes install as inactive drafts with runtime off. These starter recipes create internal
            CRM follow-up tasks only.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSafetyOpen(true)}
          className="ml-auto hidden shrink-0 items-center gap-1 text-[11.5px] font-bold text-[#216349] sm:inline-flex"
        >
          How activation works <ArrowRight size={13} />
        </button>
      </section>

      <section className="grid gap-3 rounded-[13px] border border-[#dee8e1] bg-white p-4 shadow-[0_3px_14px_rgba(30,66,48,.035)] md:grid-cols-[1fr_auto_1fr_auto_1.15fr] md:items-center">
        <GuideStep icon={Search} title="1. Find a recipe" text="Choose a starting workflow" />
        <ArrowRight className="mx-auto rotate-90 text-[#bac9c1] md:rotate-0" size={18} />
        <GuideStep icon={FileText} title="2. Install as draft" text="Review before saving" />
        <ArrowRight className="mx-auto rotate-90 text-[#bac9c1] md:rotate-0" size={18} />
        <GuideStep
          icon={SlidersHorizontal}
          title="3. Customize & activate"
          text="Test and publish in Flow Builder"
        />
      </section>

      {mode === 'gallery' ? (
        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-[#173b30]">Explore recipes</h2>
              <p className="mt-1 text-[11.5px] text-[#698176]">
                Purpose-built starting points for everyday admissions and sales follow-ups.
              </p>
            </div>
            <span className="hidden text-[11px] text-[#7c9186] sm:block">
              {visibleRecipes.length} {visibleRecipes.length === 1 ? 'recipe' : 'recipes'} available
            </span>
          </div>

          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Recipe categories">
              {categories.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={category === item.key}
                  onClick={() => setCategory(item.key)}
                  className={`min-h-8 rounded-lg border px-3 text-[11.5px] font-semibold ${
                    category === item.key
                      ? 'border-[#d4e8da] bg-[#e6f1eb] text-[#1b6548]'
                      : 'border-transparent text-[#6e8678] hover:bg-[#edf5ef]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="flex h-9 w-full items-center gap-2 rounded-[9px] border border-[#dee8e1] bg-white px-3 text-[#8ca194] lg:w-[285px]">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                type="search"
                aria-label="Search automation recipes"
                placeholder="Search automation recipes..."
                className="min-w-0 flex-1 border-0 bg-transparent text-xs text-[#173b30] outline-none placeholder:text-[#9caea4]"
              />
            </label>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {visibleRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.key}
                recipe={recipe}
                installed={installedMap.get(recipe.key)}
                canManage={canManage}
                onPreview={() => setPreviewKey(recipe.key)}
                onInstall={() => openInstall(recipe.key)}
              />
            ))}
            {visibleRecipes.length === 0 ? (
              <div className="rounded-[13px] border border-dashed border-[#cadcd0] bg-white px-6 py-12 text-center xl:col-span-2">
                <Search className="mx-auto text-[#87a08f]" size={25} />
                <h3 className="mt-2 text-sm font-bold text-[#173b30]">No matching recipes</h3>
                <p className="mt-1 text-xs text-[#698176]">
                  Try another search or choose a different category.
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-[13px] border border-[#d8e8de] bg-[#edf5f0] p-4 sm:flex-row sm:items-center">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#dbeee1] text-[#277454]">
              <Workflow size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <strong className="text-[12.5px] text-[#173b30]">
                Need customer messaging or a multi-step journey?
              </strong>
              <p className="mt-1 text-[11.5px] text-[#6b8375]">
                Open a recipe in Flow Builder to add approved WhatsApp templates, waits, branching and
                human approvals.
              </p>
            </div>
            <Link
              href="/automation/flow-builder"
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-[#dee8e1] bg-white px-3 text-[11.5px] font-bold text-[#163e33]"
            >
              Open Flow Builder <ArrowRight size={13} />
            </Link>
          </div>
        </section>
      ) : (
        <section>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-[#173b30]">
                My installed recipes
              </h2>
              <p className="mt-1 text-[11.5px] text-[#698176]">
                Starter recipes installed in this workspace. Their current workflow status is shown below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMode('gallery')}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#dee8e1] bg-white px-3 text-[11.5px] font-bold text-[#163e33]"
            >
              <ArrowRight className="rotate-180" size={13} /> Browse recipes
            </button>
          </div>
          <div className="overflow-hidden rounded-[13px] border border-[#dee8e1] bg-white">
            {installedCatalog.length ? (
              installedCatalog.map((recipe) => {
                const installed = installedMap.get(recipe.key)!;
                const Icon = recipe.icon;
                return (
                  <div
                    key={recipe.key}
                    className="flex flex-col gap-3 border-b border-[#e8eeea] p-4 last:border-b-0 sm:flex-row sm:items-center"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#eaf5ec] text-[#276e55]">
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <strong className="text-[13px] text-[#173b30]">{recipe.name}</strong>
                      <p className="mt-1 text-[11.5px] text-[#698176]">
                        {recipe.event} → {recipe.action}
                      </p>
                    </div>
                    <span className="w-fit rounded-[7px] border border-[#f0e4c8] bg-[#fff8e9] px-2 py-1 text-[10.5px] font-bold text-[#986f29]">
                      {statusLabel(installed.status)}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewKey(recipe.key)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#dee8e1] bg-white px-3 text-[11px] font-bold text-[#163e33]"
                      >
                        View details
                      </button>
                      <Link
                        href={`/automation/flow-builder?workflow=${encodeURIComponent(installed.workflowId)}`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#dee8e1] bg-white px-3 text-[11px] font-bold text-[#163e33]"
                      >
                        Open workflow <ArrowRight size={12} />
                      </Link>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-6 py-12 text-center">
                <FileText className="mx-auto text-[#87a08f]" size={25} />
                <h3 className="mt-2 text-sm font-bold text-[#173b30]">No installed recipes yet</h3>
                <p className="mt-1 text-xs text-[#698176]">
                  Browse the gallery and install a recipe to see it here.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {selectedRecipe ? (
        <>
          <button
            type="button"
            aria-label="Close recipe preview"
            onClick={() => setPreviewKey(null)}
            className="fixed inset-0 z-[80] bg-[#0d261e]/30"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="recipe-preview-title"
            className="fixed inset-y-0 right-0 z-[90] flex w-full max-w-[514px] flex-col bg-white shadow-[-15px_0_70px_rgba(21,57,45,.13)]"
          >
            <div className="flex items-center justify-between border-b border-[#dee8e1] px-5 py-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#8da496]">
                Recipe preview
              </span>
              <button
                type="button"
                onClick={() => setPreviewKey(null)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#e2eae5] text-[#688071]"
                aria-label="Close preview"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              <RecipePreview recipe={selectedRecipe} />
            </div>
            <div className="border-t border-[#dee8e1] bg-white p-4 sm:px-6">
              <div className="mb-3 flex items-center gap-1.5 text-[11px] text-[#799185]">
                <ShieldCheck size={14} /> Installs as an inactive draft. Review and activation happen later.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewKey(null)}
                  className="h-9 flex-1 rounded-[9px] border border-[#dee8e1] bg-white text-xs font-bold text-[#163e33]"
                >
                  Back to gallery
                </button>
                {installedMap.has(selectedRecipe.key) ? (
                  <Link
                    href={`/automation/flow-builder?workflow=${encodeURIComponent(
                      installedMap.get(selectedRecipe.key)!.workflowId,
                    )}`}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-[9px] bg-[#1d604c] text-xs font-bold text-white"
                  >
                    Open workflow <ArrowRight size={13} />
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => openInstall(selectedRecipe.key)}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-[9px] bg-[#1d604c] text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus size={13} /> Install as draft
                  </button>
                )}
              </div>
            </div>
          </aside>
        </>
      ) : null}

      {pendingInstall ? (
        <div
          className="fixed inset-0 z-[110] grid place-items-center bg-[#0e261d]/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-recipe-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInstallKey(null);
          }}
        >
          <div className="w-full max-w-[465px] rounded-[18px] bg-white p-6 shadow-[0_22px_65px_rgba(16,46,36,.17)]">
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-[13px] bg-[#e6f5ea] text-[#1d604c]">
              <FileText size={20} />
            </div>
            <h2 id="install-recipe-title" className="text-xl font-bold tracking-[-0.025em] text-[#173b30]">
              Install recipe as a draft?
            </h2>
            <p className="mt-2 text-[12.5px] leading-6 text-[#6b8275]">
              “{pendingInstall.name}” will be added to this workspace as a real draft automation for your
              team to review.
            </p>
            <div className="my-5 rounded-[10px] border border-[#e3ece5] bg-[#f8faf9] p-3 text-[11.8px] text-[#526f5c]">
              <ConfirmLine>Runtime will remain OFF</ConfirmLine>
              <ConfirmLine>No customer message is sent by this recipe</ConfirmLine>
              <ConfirmLine>Customize and validate before publishing</ConfirmLine>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInstallKey(null)}
                className="h-9 rounded-[9px] border border-[#dee8e1] bg-white px-4 text-xs font-bold text-[#163e33]"
              >
                Cancel
              </button>
              <form action={installSmartTriggerRecipeAction}>
                <input type="hidden" name="recipe_key" value={pendingInstall.key} />
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-2 rounded-[9px] bg-[#1d604c] px-4 text-xs font-bold text-white"
                >
                  <Plus size={13} /> Install draft
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {safetyOpen ? (
        <div
          className="fixed inset-0 z-[110] grid place-items-center bg-[#0e261d]/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="activation-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSafetyOpen(false);
          }}
        >
          <div className="w-full max-w-[465px] rounded-[18px] bg-white p-6 shadow-[0_22px_65px_rgba(16,46,36,.17)]">
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-[13px] bg-[#e6f5ea] text-[#1d604c]">
              <ShieldCheck size={20} />
            </div>
            <h2 id="activation-title" className="text-xl font-bold tracking-[-0.025em] text-[#173b30]">
              From template to live workflow
            </h2>
            <p className="mt-2 text-[12.5px] leading-6 text-[#6b8275]">
              Starter Recipes are templates. Install a draft, customize it in Flow Builder, validate it,
              publish it, and only then enable runtime through the existing controlled workflow process.
            </p>
            <div className="my-5 rounded-[10px] border border-[#e3ece5] bg-[#f8faf9] p-3 text-[11.8px] text-[#526f5c]">
              <ConfirmLine>Install — create a safe inactive copy</ConfirmLine>
              <ConfirmLine>Customize — choose the real rules and team behavior</ConfirmLine>
              <ConfirmLine>Validate and publish — review the complete draft</ConfirmLine>
              <ConfirmLine>Enable runtime — a separate controlled step</ConfirmLine>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSafetyOpen(false)}
                className="h-9 rounded-[9px] bg-[#1d604c] px-4 text-xs font-bold text-white"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GuideStep({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Search;
  title: string;
  text: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-[#e8f1ea] bg-[#f1f7f3] text-[#297355]">
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <strong className="block text-xs text-[#173b30]">{title}</strong>
        <span className="text-[10.8px] text-[#82988b]">{text}</span>
      </div>
    </div>
  );
}

function RecipeCard({
  recipe,
  installed,
  canManage,
  onPreview,
  onInstall,
}: {
  recipe: Recipe;
  installed?: InstalledRecipe;
  canManage: boolean;
  onPreview: () => void;
  onInstall: () => void;
}) {
  const Icon = recipe.icon;
  return (
    <article className="rounded-[15px] border border-[#dce7df] bg-white p-5 shadow-[0_3px_14px_rgba(30,66,48,.035)] transition hover:border-[#b6d5c3] hover:shadow-[0_7px_20px_rgba(23,75,50,.065)]">
      <div className="mb-4 flex items-start gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${recipe.iconTone}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.085em] text-[#8b9f92]">
              {recipe.categoryLabel}
            </span>
            {recipe.recommended ? (
              <span className="rounded-md border border-[#d7eade] bg-[#edf8f0] px-1.5 py-0.5 text-[9.5px] font-bold text-[#347055]">
                Recommended
              </span>
            ) : null}
            {installed ? (
              <span className="rounded-md border border-[#e5ebe6] bg-[#f4f7f5] px-1.5 py-0.5 text-[9.5px] font-bold text-[#677e72]">
                Installed
              </span>
            ) : null}
          </div>
          <h3 className="text-[17px] font-bold tracking-[-0.018em] text-[#173c30]">{recipe.name}</h3>
          <p className="mt-1 text-[11.8px] leading-5 text-[#72887a]">{recipe.description}</p>
        </div>
      </div>
      <div className="mb-3 grid gap-0 overflow-hidden rounded-[10px] border border-[#e7ede9] bg-[#f8faf9] sm:grid-cols-[1fr_40px_1fr]">
        <div className="p-3">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#8b9e93]">When</div>
          <div className="mt-1 text-xs font-semibold text-[#264a3c]">{recipe.event}</div>
        </div>
        <div className="hidden place-items-center text-[#a3b7aa] sm:grid">
          <ArrowRight size={17} />
        </div>
        <div className="border-t border-[#e7ede9] p-3 sm:border-l sm:border-t-0">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#8b9e93]">Then</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[#264a3c]">
            <ListChecks size={13} />
            {recipe.action}
          </div>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-[10.7px] text-[#758b7d]">
        <span className="inline-flex items-center gap-1">
          <Clock3 size={13} />
          {recipe.delay}
        </span>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck size={13} />
          Internal CRM task
        </span>
      </div>
      <div className="flex flex-col gap-2 border-t border-[#e8eeea] pt-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onPreview}
          className="inline-flex h-8 items-center gap-1 text-[11.8px] font-bold text-[#1d604c]"
        >
          Preview recipe <ArrowRight size={13} />
        </button>
        {installed ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[#277052]">
            <CheckCircle2 size={15} /> Installed · {statusLabel(installed.status)}
          </span>
        ) : canManage ? (
          <button
            type="button"
            onClick={onInstall}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#dee8e1] bg-white px-3 text-[11.5px] font-bold text-[#163e33] hover:bg-[#f8fbf8]"
          >
            <Plus size={13} /> Install as draft
          </button>
        ) : (
          <span className="text-[11px] text-[#82988b]">Admin access required</span>
        )}
      </div>
    </article>
  );
}

function RecipePreview({ recipe }: { recipe: Recipe }) {
  const Icon = recipe.icon;
  return (
    <>
      <div className="mb-5 flex items-start gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${recipe.iconTone}`}>
          <Icon size={20} />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#8da496]">
            {recipe.categoryLabel}
          </div>
          <h2 id="recipe-preview-title" className="mt-1 text-[23px] font-bold tracking-[-0.035em] text-[#173b30]">
            {recipe.name}
          </h2>
          <p className="mt-1 text-[12.5px] text-[#698176]">{recipe.description}</p>
        </div>
      </div>
      <div className="mb-5 flex gap-2 rounded-[9px] border border-[#d3e8d8] bg-[#ecf8f0] p-3 text-[11.5px] leading-5 text-[#3c7858]">
        <ShieldCheck className="mt-0.5 shrink-0" size={17} />
        <span>
          <strong>Safe template.</strong> Creates an internal task only. Runtime remains off until separately
          reviewed and enabled.
        </span>
      </div>
      <section className="mb-5">
        <h3 className="mb-3 text-[13px] font-bold text-[#173b30]">How this recipe works</h3>
        <div className="ml-3 space-y-3 border-l-2 border-[#d9e8de] pl-5">
          <JourneyStep
            index="01"
            label="Event"
            title={recipe.event}
            text="The event that starts this draft workflow."
          />
          <JourneyStep
            index="02"
            label={recipe.delay === 'Immediately' ? 'Internal action' : 'Delayed internal action'}
            title={recipe.action}
            text={
              recipe.delay === 'Immediately'
                ? 'SalsysOS creates the internal follow-up task immediately.'
                : `SalsysOS creates the internal follow-up task ${recipe.delay.toLowerCase()}.`
            }
          />
          <JourneyStep
            index="03"
            label="End"
            title="Workflow completes"
            text="Review or extend the sequence in Flow Builder."
          />
        </div>
      </section>
      <section className="mb-5">
        <h3 className="mb-2 text-[13px] font-bold text-[#173b30]">Why teams use it</h3>
        {recipe.outcomes.map((item) => (
          <div key={item} className="my-2 flex items-start gap-2 text-xs text-[#60776a]">
            <CheckCircle2 className="mt-0.5 shrink-0 text-[#438a66]" size={16} />
            <span>{item}</span>
          </div>
        ))}
      </section>
      <section>
        <h3 className="mb-2 text-[13px] font-bold text-[#173b30]">What you can customize later</h3>
        <p className="text-xs leading-6 text-[#6e8679]">{recipe.customize}</p>
      </section>
    </>
  );
}

function JourneyStep({
  index,
  label,
  title,
  text,
}: {
  index: string;
  label: string;
  title: string;
  text: string;
}) {
  return (
    <div className="relative rounded-[10px] border border-[#e7eee8] bg-[#f8faf8] p-3 before:absolute before:-left-[27px] before:top-4 before:h-3 before:w-3 before:rounded-full before:border-2 before:border-white before:bg-[#e7f3eb] before:outline before:outline-1 before:outline-[#bddbc9]">
      <small className="block text-[10px] font-bold uppercase tracking-[0.09em] text-[#829889]">
        {index} · {label}
      </small>
      <strong className="mt-1 block text-[12.5px] text-[#173b30]">{title}</strong>
      <p className="mt-1 text-[11.3px] text-[#768e80]">{text}</p>
    </div>
  );
}

function ConfirmLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-2 flex items-center gap-2">
      <CheckCircle2 className="shrink-0 text-[#38845f]" size={16} />
      <span>{children}</span>
    </div>
  );
}
