import { defineConfig } from '@unocss/vite';
import { presetMini } from '@unocss/preset-mini';
import { presetIcons } from '@unocss/preset-icons';
import { presetTypography } from '@unocss/preset-typography';

/**
 * Tokens are mirrored verbatim from the Figma export `styles.css` in
 * /steam/rotko/ibp/figma/export/. Don't drift them — if the Figma palette
 * changes, re-run the extract and sync here.
 */
export default defineConfig({
  presets: [
    presetMini({ dark: 'class' }),
    presetIcons({
      scale: 1.2,
      warn: true,
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
    }),
    presetTypography(),
  ],
  theme: {
    colors: {
      // Brand accent — cyan + magenta. Anything previously bound to "brand"
      // resolves to cyan now so existing usages keep working.
      cyan: {
        DEFAULT: '#00D0FF',
        200: '#9FEEFF',
        300: '#5DDFFF',
        400: '#33B1FF',
        500: '#00D0FF',
        600: '#00A3CC',
      },
      magenta: {
        DEFAULT: '#F502FF',
        200: '#FDA4FF',
        300: '#FA66FF',
        400: '#DC3AD8',
        500: '#F502FF',
        600: '#B400BC',
      },
      brand: {
        DEFAULT: '#00D0FF',
        200: '#9FEEFF',
        300: '#5DDFFF',
        400: '#33B1FF',
        500: '#00D0FF',
        600: '#00A3CC',
      },
      pink: {
        DEFAULT: '#FF409F',
        300: '#FF80BD',
        500: '#FF409F',
      },
      // Ink scale — pure black to off-white. Strictly grayscale per Figma.
      ink: {
        950: '#000000',
        900: '#050505',
        800: '#0A0A0A',
        700: '#0F0F0F',
        600: '#1A1A1A',  // --line-2
        500: '#2D2D2D',  // --line
        400: '#3A3A3A',
      },
      paper: {
        DEFAULT: '#FFFFFF',
        muted: '#C8C8C8',   // ≥ 7:1 vs #000 (WCAG AAA)
        dim: '#9E9E9E',     // ≥ 4.5:1 vs #000 (WCAG AA) — was #7E7E7E (3.9:1, failing)
      },
    },
    fontFamily: {
      // System-font stack only. macOS / iOS get Avenir Next (the Figma
      // typeface, native there); Windows gets Segoe UI Variable; Linux
      // gets Cantarell / Ubuntu / DejaVu via system-ui. We dropped Inter
      // (the previous web-font fallback) to take the LCP critical path
      // off the network entirely — see comment block in src/index.css.
      sans: ['"Avenir Next"', 'Avenir', 'system-ui', '-apple-system', '"Segoe UI"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      display: ['"Avenir Next"', 'Avenir', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      mono: ['"JetBrains Mono"', '"Berkeley Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
    },
  },
  shortcuts: {
    // Container width matches the Figma `.shell` (max 1700px). At smaller
    // viewports the px-* padding kicks in to keep content off the edges.
    'container-page': 'max-w-[1700px] mx-auto px-5 sm:px-8 lg:px-12',
    // Section vertical rhythm — Figma sections sit between 120-140px tall.
    // py-28 md:py-36 lands at 112/144px, the closest Tailwind step pair.
    'section': 'py-20 md:py-28 lg:py-36',

    // Display headings: light weight + tight tracking — matches Figma 64-96px headings.
    'h-display': 'font-display font-light tracking-[-0.015em] leading-[1.05]',

    // Pill — the defining UI element from Figma: glassy, rounded, blurred bg.
    // backdrop-blur is set by a custom rule below (Figma uses 20px) — presetMini
    // does not ship size variants for backdrop-blur.
    'pill': 'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md bg-glass border border-white/6 text-sm text-paper backdrop-blur-20 transition-all duration-200 hover:bg-glass-strong hover:border-white/15',
    'pill-sm': 'inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-md bg-glass border border-white/6 text-xs text-paper backdrop-blur-20 tracking-[0.02em] transition-all duration-200 hover:bg-glass-strong hover:border-white/15',
    'pill-cta': 'pill bg-grad-soft border-white/20 hover:bg-grad-soft-strong',

    // Legacy shortcuts (now mapped to new design language)
    'btn': 'pill',
    'btn-primary': 'pill-cta',
    'btn-ghost': 'pill',
    'card': 'relative bg-glass border border-white/6 rounded-2xl p-5 sm:p-7 min-w-0 overflow-hidden transition-all duration-200',
    'card-hover': 'card hover:bg-glass-strong hover:border-white/15',
    'card-cosmic': 'card',
    'eyebrow': 'eyebrow-grad text-[11px] uppercase tracking-[0.28em] font-medium',
  },
  rules: [
    ['uppercase', { 'text-transform': 'uppercase' }],
    ['lowercase', { 'text-transform': 'lowercase' }],
    ['capitalize', { 'text-transform': 'capitalize' }],
    ['normal-case', { 'text-transform': 'none' }],

    // Glass background tokens — rgba(217,217,217,0.10) per Figma.
    ['bg-glass',        { background: 'rgba(217,217,217,0.10)' }],
    ['bg-glass-strong', { background: 'rgba(217,217,217,0.14)' }],

    // Backdrop blur — Figma pill uses 20px. presetMini ships only one size.
    ['backdrop-blur-20', { 'backdrop-filter': 'blur(20px)', '-webkit-backdrop-filter': 'blur(20px)' }],
    ['backdrop-blur-18', { 'backdrop-filter': 'blur(18px)', '-webkit-backdrop-filter': 'blur(18px)' }],
    ['bg-grad-soft',    { background: 'linear-gradient(135deg, rgba(0,208,255,0.18), rgba(245,2,255,0.18))' }],
    ['bg-grad-soft-strong', { background: 'linear-gradient(135deg, rgba(0,208,255,0.32), rgba(245,2,255,0.32))' }],

    // Gradient text + accents — cyan→magenta (the Figma "--grad").
    ['cosmic-text', {
      'background': 'linear-gradient(90deg, #00D0FF 0%, #F502FF 100%)',
      '-webkit-background-clip': 'text',
      'background-clip': 'text',
      '-webkit-text-fill-color': 'transparent',
      'color': 'transparent',
    }],
    ['eyebrow-grad', {
      'background': 'linear-gradient(90deg, #00D0FF 0%, #F502FF 100%)',
      '-webkit-background-clip': 'text',
      'background-clip': 'text',
      '-webkit-text-fill-color': 'transparent',
      'color': 'transparent',
      'display': 'inline-block',
    }],
    ['cosmic-bar', {
      'background': 'linear-gradient(90deg, #00D0FF 0%, #F502FF 100%)',
    }],
    ['bg-card-tilt', {
      'background': 'linear-gradient(135deg, rgba(217,217,217,0.06) 0%, rgba(217,217,217,0.02) 100%)',
    }],
    ['bg-cosmos', {
      'background':
        'radial-gradient(1200px 700px at 50% -10%, rgba(0,208,255,0.15), transparent 60%),' +
        'radial-gradient(900px 600px at 80% 30%, rgba(245,2,255,0.12), transparent 60%),' +
        '#000',
    }],
    ['bg-grid', {
      'background-image':
        'radial-gradient(circle at center, rgba(255,255,255,0.06) 1px, transparent 1.5px)',
      'background-size': '24px 24px',
    }],
  ],
  safelist: [
    'i-mdi-earth',
    'i-mdi-shield-check',
    'i-mdi-leaf',
    'i-mdi-server-network',
    'i-mdi-lightning-bolt',
    'i-mdi-chart-line',
    'i-mdi-content-copy',
    'i-mdi-magnify',
    'i-mdi-chevron-down',
    'i-mdi-map-marker',
    'i-mdi-wallet-outline',
    'i-mdi-language-typescript',
    'i-mdi-server',
    'i-mdi-lightning-bolt-circle',
    'i-mdi-information-outline',
    'i-mdi-account-group',
    'i-mdi-book-open-page-variant',
    'i-mdi-arrow-top-right',
    'i-mdi-arrow-right',
    'i-mdi-github',
    'i-mdi-matrix',
    'i-mdi-menu',
    'i-mdi-close',
    'i-mdi-check-circle',
    'i-mdi-language-html5',
    'i-mdi-cellphone-link',
    'i-mdi-shield-link-variant-outline',
    'i-mdi-chat-question-outline',
    'i-mdi-shield-check-outline',
    'i-mdi-twitter',
    'i-mdi-file-code-outline',
    'i-mdi-flash',
  ],
});
