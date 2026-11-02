import type { KnowledgeEvidence } from '@/lib/knowledge-evidence';
export function KnowledgeEvidenceList({ evidence }: { evidence?: KnowledgeEvidence[] }) {
  if (!evidence?.length) return null;
  return <details className="rounded-lg border border-line p-3 text-xs text-copy-muted">
    <summary className="cursor-pointer font-medium text-copy-strong">Retrieved knowledge context</summary>
    <p className="mt-2 leading-5">These documents were supplied to the draft. This is not verification of every sentence; review the draft before sending.</p>
    <ul className="mt-2 space-y-2">{evidence.map(item => <li key={item.documentId}><span className="font-medium text-copy-strong">{item.title}</span> · {item.version === null ? 'Version unavailable' : `Version ${item.version}`}{item.validUntil ? ` · Valid until ${new Date(item.validUntil).toISOString()}` : ' · No expiry recorded'}</li>)}</ul>
  </details>;
}
