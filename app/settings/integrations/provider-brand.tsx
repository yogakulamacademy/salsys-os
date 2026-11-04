import type { ReactNode } from 'react';
import { Instagram, MessageCircle, Phone } from 'lucide-react';
import type { IntegrationProvider } from '@/lib/integrations/types';

/** Brand-inspired provider markers. Display-only; connection state comes from tenant data. */
export function ProviderBrand({ provider }: { provider: IntegrationProvider }): ReactNode {
  if (provider === 'google') {
    return <svg viewBox="0 0 24 24" width="28" height="28" role="img" aria-label="Google">
      <path fill="#4285F4" d="M22.5 12.25c0-.72-.07-1.4-.2-2.06H12v3.89h5.88a5 5 0 0 1-2.16 3.22v2.58h3.32c2.19-2.02 3.46-4.99 3.46-7.63Z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.47-.98 7.3-2.67l-3.32-2.58c-.93.63-2.13 1.01-3.98 1.01-2.88 0-5.33-1.95-6.2-4.56H2.39v2.66A11 11 0 0 0 12 23Z"/>
      <path fill="#FBBC05" d="M5.8 14.2a6.57 6.57 0 0 1 0-4.4V7.14H2.39a11 11 0 0 0 0 9.72L5.8 14.2Z"/>
      <path fill="#EA4335" d="M12 5.24c1.61 0 3.06.55 4.21 1.66l3.13-3.12A10.7 10.7 0 0 0 12 1C7.72 1 4.02 3.45 2.39 7.14L5.8 9.8c.87-2.61 3.32-4.56 6.2-4.56Z"/>
    </svg>;
  }
  if (provider === 'meta') return <span className="aiu-brand-meta" aria-label="Meta" role="img">∞</span>;
  if (provider === 'instagram') return <span className="aiu-brand-instagram"><Instagram size={27} strokeWidth={2.3} aria-label="Instagram"/></span>;
  return <span className="aiu-brand-whatsapp"><MessageCircle size={29} strokeWidth={2.3} aria-label="WhatsApp Business"/><Phone size={12} aria-hidden="true"/></span>;
}
