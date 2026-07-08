// ============================================================================
//  sources.js — presentation-only metadata per source id (brand accent colour +
//  glyph). Kept deliberately apart from data/trending.json: the fetcher owns
//  *what* is trending; this owns *how each source looks*. Add a source here to
//  give it an identity; unknown ids fall back to DEFAULT_META.
// ============================================================================

export const SOURCE_META = {
    deezer:  { accent: "#a45cff", glyph: "D" },
    youtube: { accent: "#ff4e45", glyph: "▶" },
    apple:   { accent: "#fa2d5a", glyph: "" },   // Apple: no glyph, art carries it
    anghami: { accent: "#7c3aed", glyph: "a" },
    spotify: { accent: "#1db954", glyph: "S" },
};

export const DEFAULT_META = { accent: "#3b82f6", glyph: "♪" };

export const metaFor = id => SOURCE_META[id] || DEFAULT_META;
