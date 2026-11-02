/** Presentation-only helpers. Raw source values remain unchanged. */
export function personInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return words.slice(0, 2).map(word => [...segmenter.segment(word)][0]?.segment ?? "").join("").toLocaleUpperCase() || "?";
}

export function percentageWidth(value: number | null | undefined, max = 100) {
  if (value == null || !Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, value / max * 100));
}

export function sourceLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    "google": "Google", "www.google.com": "Google", "google.com": "Google",
    "instagram": "Instagram", "ig": "Instagram", "l.instagram.com": "Instagram", "instagram.com": "Instagram",
    "whatsapp": "WhatsApp", "chatgpt.com": "ChatGPT", "chatgpt": "ChatGPT",
    "direct": "Direct", "unknown": "Unknown",
  };
  return labels[normalized] ?? value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
