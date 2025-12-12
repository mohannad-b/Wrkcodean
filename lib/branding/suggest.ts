const CONSUMER_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "me.com",
  "live.com",
]);

function titleCase(input: string) {
  return input
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 50);
}

function hslToHex(h: number, s: number, l: number) {
  // h: [0,360), s,l: [0,1]
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hashDomain(domain: string) {
  let hash = 0;
  for (let i = 0; i < domain.length; i += 1) {
    hash = (hash * 31 + domain.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export type BrandingSuggestion = {
  name: string;
  slug: string;
  primaryColor: string;
  accentColor: string;
  logoEmoji: string;
  source: "domain" | "fallback";
};

export function suggestBrandingFromDomain(domain: string, fallbackName: string, fallbackSlug: string): BrandingSuggestion {
  const cleaned = domain.trim().toLowerCase();

  if (!cleaned || CONSUMER_DOMAINS.has(cleaned)) {
    return {
      name: fallbackName,
      slug: fallbackSlug,
      primaryColor: "#111827",
      accentColor: "#E43632",
      logoEmoji: "✨",
      source: "fallback",
    };
  }

  const base = cleaned.replace(/\.[a-z]+$/i, "");
  const name = titleCase(base.replace(/\./g, " "));
  const slug = slugify(base);

  const hash = hashDomain(cleaned);
  const hue = hash % 360;
  const primary = hslToHex(hue, 0.45, 0.46);
  const accent = hslToHex((hue + 30) % 360, 0.55, 0.54);

  const emojiPool = ["🏢", "🏭", "🏗️", "🏬", "🏦", "🏫", "🏢", "🏙️", "🏰", "⚙️", "💡", "🚀"];
  const logoEmoji = emojiPool[hash % emojiPool.length];

  return {
    name: name || fallbackName,
    slug: slug || fallbackSlug,
    primaryColor: primary,
    accentColor: accent,
    logoEmoji,
    source: "domain",
  };
}
