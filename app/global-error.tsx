'use client';

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <head>
        <style>{`
          :root {
            color-scheme: light dark;
            --error-bg: #F8F7FC;
            --error-surface: #FFFFFF;
            --error-surface-soft: #F5F2FD;
            --error-border: #E6E3EF;
            --error-text: #24213C;
            --error-muted: #67627A;
            --error-brand: #5743C5;
            --error-brand-hover: #4632AA;
            --error-warning-bg: #FFF7ED;
            --error-warning: #BC7518;
          }

          @media (prefers-color-scheme: dark) {
            :root {
              --error-bg: #14111F;
              --error-surface: #1D192A;
              --error-surface-soft: #28213B;
              --error-border: #37304A;
              --error-text: #F6F3FF;
              --error-muted: #B5ADC8;
              --error-brand: #A99AF0;
              --error-brand-hover: #B9ACF4;
              --error-warning-bg: #332614;
              --error-warning: #E9A950;
            }
          }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          background: 'var(--error-bg)',
          color: 'var(--error-text)',
        }}
      >
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            boxSizing: 'border-box',
          }}
        >
          <section
            style={{
              width: '100%',
              maxWidth: 520,
              border: '1px solid var(--error-border)',
              borderRadius: 16,
              background: 'var(--error-surface)',
              padding: 28,
              textAlign: 'center',
              boxSizing: 'border-box',
              boxShadow: '0 16px 48px rgba(33, 27, 58, 0.08)',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto',
                background: 'var(--error-warning-bg)',
                color: 'var(--error-warning)',
                fontWeight: 700,
              }}
            >
              !
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--error-brand)',
              }}
            >
              SalsysOS recovery
            </div>
            <h1 style={{ margin: '8px 0 0', fontSize: 26, lineHeight: 1.2, letterSpacing: '-0.03em' }}>
              We couldn’t open SalsysOS
            </h1>
            <p
              style={{
                margin: '12px auto 0',
                maxWidth: 420,
                fontSize: 14,
                lineHeight: 1.6,
                color: 'var(--error-muted)',
              }}
            >
              An unexpected application error occurred. Try again first. If the problem continues, return to sign in.
            </p>
            <div
              style={{
                marginTop: 24,
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={reset}
                style={{
                  border: 0,
                  borderRadius: 8,
                  background: 'var(--error-brand)',
                  color: '#ffffff',
                  padding: '11px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
              <a
                href="/login"
                style={{
                  border: '1px solid var(--error-border)',
                  borderRadius: 8,
                  background: 'var(--error-surface-soft)',
                  color: 'var(--error-text)',
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Return to sign in
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
