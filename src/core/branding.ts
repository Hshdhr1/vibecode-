export const BRAND = {
    name: 'OnlySq CLI',
    accent: '#fd6b03',
    accentDim: '#c5530028',
    fg: '#ffffff',
    bg: '#0d1117',
    bgPanel: '#161b22',
    border: '#30363d',
    muted: '#8b949e',
    error: '#f85149',
    ok: '#3fb950',
} as const;

export function logoSvg(size = 24): string {
    return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
<rect width="32" height="32" rx="7" fill="${BRAND.bgPanel}"/>
<text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle"
      font-family="-apple-system,Segoe UI,sans-serif" font-weight="800" font-size="11"
      letter-spacing="-0.5">
  <tspan fill="${BRAND.fg}">Only</tspan><tspan fill="${BRAND.accent}">Sq</tspan>
</text></svg>`;
}

export function logoHtml(size = 18): string {
    return `<span class="logo" style="font-weight:800;letter-spacing:-0.3px;font-size:${size}px">` +
        `<span style="color:${BRAND.fg}">Only</span>` +
        `<span style="color:${BRAND.accent}">Sq</span></span>`;
}