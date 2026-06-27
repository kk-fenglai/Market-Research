---
name: Synthetica Research System
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#c7c4d7'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#908fa0'
  outline-variant: '#464554'
  surface-tint: '#c0c1ff'
  primary: '#c0c1ff'
  on-primary: '#1000a9'
  primary-container: '#8083ff'
  on-primary-container: '#0d0096'
  inverse-primary: '#494bd6'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffb783'
  on-tertiary: '#4f2500'
  tertiary-container: '#d97721'
  on-tertiary-container: '#452000'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdcc5'
  tertiary-fixed-dim: '#ffb783'
  on-tertiary-fixed: '#301400'
  on-tertiary-fixed-variant: '#703700'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  data-lg:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '500'
    lineHeight: '1.2'
  data-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.0'
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 40px
  gutter: 20px
---

## Brand & Style
The design system is engineered for high-stakes market intelligence. It departs from the "playful AI" aesthetic, adopting a **Developer-grade / Modern Corporate** style that emphasizes precision, transparency, and raw data utility. 

The brand personality is **Analytical, Robust, and Expert**. It communicates authority through a "glass-box" approach—showing the user the reasoning and sources behind every AI-generated insight. The interface utilizes high-contrast typography, structural grid lines, and a dark-mode-first architecture to reduce cognitive load during deep work sessions.

## Colors
The palette is rooted in a **Deep Charcoal and Navy** foundation to establish a "command center" environment. 

- **Primary (Electric Indigo):** Used exclusively for high-intent actions and primary navigation highlights. 
- **Emerald (Confidence High):** Reserved for data points with >90% confidence scores and "Success" states.
- **Amber (Warning):** Indicates low-sample sizes, conflicting data sources, or items requiring manual verification.
- **Slate (Muted):** Used for metadata, secondary labels, and inactive interface elements to keep the focus on active data.
- **Borders:** A consistent, low-contrast slate border is used to define structural boundaries without cluttering the visual field.

## Typography
The system employs a dual-font strategy. **Inter** handles all structural and narrative content, providing a clean, neutral canvas that feels professional and contemporary. 

**JetBrains Mono** is utilized for all "system-generated" data points, confidence scores, source citations, and timestamps. This monospaced contrast signals to the user exactly which parts of the UI are "raw data" vs. "interface." Use `label-caps` for table headers and section overlines to maintain a technical, disciplined hierarchy.

## Layout & Spacing
The layout follows a **Rigid Grid** philosophy. Content is organized in a 12-column system for desktop, collapsing to a single column for mobile. 

We utilize a compact spacing scale to maximize information density. Dashboard widgets should typically have 16px (`md`) of internal padding. Large data visualizations should be separated by 24px (`lg`) gaps to prevent visual bleeding. Use 8px (`xs`) for internal element grouping (e.g., an icon paired with a label).

## Elevation & Depth
In this design system, depth is communicated through **Tonal Layering and Thin Outlines** rather than heavy shadows. 

1. **Level 0 (Background):** Deepest Navy/Slate (`#020617`).
2. **Level 1 (Cards/Widgets):** Slightly lighter Slate (`#0f172a`) with a 1px border of `#1e293b`.
3. **Level 2 (Popovers/Modals):** Lighter still, with a subtle 10% opacity Indigo shadow to suggest float.

Avoid gradients. Use a subtle "Glassmorphism" effect (backdrop blur 8px) only for sticky headers and navigation sidebars to maintain context of the content scrolling beneath.

## Shapes
The shape language is disciplined and geometric. A standard `rounded-md` (0.5rem / 8px) is the default for buttons, input fields, and small cards. Larger dashboard containers use `rounded-lg` (1rem / 16px). Status indicators and source tags utilize a full pill-shape to distinguish them from actionable buttons.

## Components

### Status Indicators (AI State)
- **Data Gathering (Perplexity-style):** A pulsing Indigo ring around a search icon with a "Scanning Sources..." label in JetBrains Mono.
- **Inference (Claude/DeepSeek-style):** A shifting gradient "shimmer" border around the card currently generating text, using the Primary Indigo and Secondary Emerald colors.

### Confidence Badges
Small, pill-shaped tags using JetBrains Mono. 
- **High (>80%):** Emerald background (15% opacity) with Emerald text.
- **Medium (50-80%):** Slate background with White text.
- **Low (<50%):** Amber background (15% opacity) with Amber text.

### Buttons & Inputs
- **Primary Button:** Solid Indigo background, White text, 8px radius. Subtle scale-down effect on click.
- **Ghost Input:** Transparent background with a 1px Slate border. On focus, the border transitions to Indigo with a 2px outer "glow" (0.15 opacity).

### Data Source Tags
Small, squared-off labels with a `source` icon. Should include a "copy link" action on hover to emphasize the "verifiable" nature of the data.

### Charts (Recharts)
Use the system color palette: Indigo for primary lines, Emerald for growth/positivity, and a muted Slate for grid lines. Disable all animations that take longer than 200ms to maintain a "snappy" developer feel.