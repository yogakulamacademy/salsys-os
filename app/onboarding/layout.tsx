import type { ReactNode } from 'react';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        /*
         * Goal cards use native checkboxes so form submission stays server-driven.
         * Tailwind's sr-only utility makes the checkbox a 1px click target, which
         * proved unreliable in the onboarding card layout. Expand only the goals
         * checkbox to the full relative label so the entire card is the native
         * interactive target without introducing client-side state.
         */
        label:has(> input[name='goals']) {
          position: relative;
        }

        label > input[name='goals'].sr-only {
          position: absolute !important;
          inset: 0 !important;
          z-index: 20 !important;
          width: 100% !important;
          height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          clip: auto !important;
          clip-path: none !important;
          white-space: normal !important;
          opacity: 0 !important;
          cursor: pointer !important;
        }

        label:has(> input[name='goals']:checked) > div {
          border-color: #73bb97 !important;
          background: #f2faf5 !important;
        }

        label:has(> input[name='goals']:checked) span.grid {
          border-color: #2e8762 !important;
          background: #2e8762 !important;
          color: #ffffff !important;
        }

        label:has(> input[name='goals']:focus-visible) > div {
          box-shadow: 0 0 0 2px #8dcaaa !important;
        }
      `}</style>
      {children}
    </>
  );
}
