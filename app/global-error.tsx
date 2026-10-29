'use client';

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Arial, Helvetica, sans-serif', background: '#f5f7f6', color: '#18362d' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px' }}>
          <section style={{ width: '100%', maxWidth: 520, border: '1px solid #dce4df', borderRadius: 18, background: '#ffffff', padding: 28, textAlign: 'center', boxSizing: 'border-box' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, display: 'grid', placeItems: 'center', margin: '0 auto', background: '#fff7ed', color: '#b45309', fontWeight: 700 }}>
              !
            </div>
            <div style={{ marginTop: 18, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#216551' }}>
              SalsysOS recovery
            </div>
            <h1 style={{ margin: '8px 0 0', fontSize: 26, lineHeight: 1.2 }}>
              We couldn’t open SalsysOS
            </h1>
            <p style={{ margin: '12px auto 0', maxWidth: 420, fontSize: 14, lineHeight: 1.6, color: '#71847a' }}>
              An unexpected application error occurred. Try again first. If the problem continues, return to sign in.
            </p>
            <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={reset}
                style={{ border: 0, borderRadius: 10, background: '#216551', color: '#ffffff', padding: '11px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Try again
              </button>
              <a
                href="/login"
                style={{ border: '1px solid #dce4df', borderRadius: 10, background: '#ffffff', color: '#18362d', padding: '10px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
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
