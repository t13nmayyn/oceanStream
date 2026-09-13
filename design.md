# UI/UX, Design Tokens & Typography System
## Project: `oceanStream` — INCOIS 3D/4D Ocean Data Platform
**Design System Name:** *Abyssal Scientific UI*  
**Document Version:** 3.0.0  

---

## 1. Color & Theme

### 1.1 Aesthetic Philosophy
The visual language of `oceanStream` is built on a **Deep Ocean Scientific Dark Mode** designed specifically for oceanographic mission-control centers, marine researchers, and hydrographic visualization. 
- **High Data Contrast:** Deep, non-reflective backgrounds ($< 5\%$ luminescence) maximize perceptual clarity for dense WebGL 3D column layers, vector current fields, and multi-line time series.
- **Bioluminescent Accents:** High-chroma cyan and electric violet guide user focus to active telemetry, cursor coordinates, and streaming WebSocket packets without causing eye strain during extended night-shift operations.
- **Strict Color-Coded Memory States:** The OS virtual memory page table uses standardized semantic indicators representing physical cache residence.

---

### 1.2 Design Tokens (`:root`)

```css
:root {
  /* ── Background & Surfaces (Oceanic Depth Tiers) ── */
  --bg:            #06090f;   /* Abyssal Void (Base canvas & page background) */
  --surface:       #0d1525;   /* Bathypelagic (Sidebars, topbars, base cards) */
  --surface-2:     #111d35;   /* Mesopelagic (Panels, modal dialogs, inputs) */
  --surface-3:     #172647;   /* Epipelagic (Elevated active cards, code containers) */

  /* ── Borders & Outlines ── */
  --border:        #1e3055;   /* Standard structural border */
  --border-bright: #2d4880;   /* Highlighted hover & active border */

  /* ── Typography & Content ── */
  --text:          #d4e3f7;   /* Primary high-contrast scientific text */
  --muted:         #6b83a6;   /* Secondary metadata, axis labels, disabled text */

  /* ── Brand Accents ── */
  --accent:        #00c8ff;   /* Electric Cyan (Primary interactive brand color) */
  --accent-2:      #7b5af5;   /* Deep Violet (Secondary accent & 3D extrusion) */

  /* ── Semantic & Cache State Indicators ── */
  --green:         #00e08c;   /* RESIDENT in L1 RAM / Online status / Success */
  --orange:        #ff7700;   /* ON_DISK in L2 Zarr / Cached on local drive */
  --amber:         #f5a623;   /* FETCHING in background / Warning status */
  --dark-page:     #121b2d;   /* NOT_FETCHED in L3 Origin / Empty memory page */
  --rose:          #f54375;   /* Error / Offline / Destructive actions */

  /* ── Typography Stacks ── */
  --font-ui:       -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
  --mono:          'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace;
}
```

---

### 1.3 Scientific Oceanographic Colormaps

All gridded raster layers, Deck.gl 3D extrusions, and colorbars map continuous ocean physics and biogeochemistry using scientifically verified colormaps:

| Variable | Colormap | Domain Range | Visual Palette |
|:---|:---|:---|:---|
| **Sea Temperature (`thetao`)** | Coolwarm / Turbo | $20.0^\circ\text{C} - 32.0^\circ\text{C}$ | Deep Navy Blue $\rightarrow$ Cyan $\rightarrow$ Amber Yellow $\rightarrow$ Crimson Red |
| **Salinity (`so`)** | Viridis | $30.0 - 36.5\,\text{PSU}$ | Deep Indigo $\rightarrow$ Teal $\rightarrow$ Emerald Green $\rightarrow$ Bright Yellow |
| **Chlorophyll-a (`chl`)** | Emerald / YlGn | $0.01 - 5.0\,\text{mg/m}^3$ | Pale Cream $\rightarrow$ Lime $\rightarrow$ Deep Oceanic Green |
| **Dissolved Oxygen (`o2`)** | Hypoxia Gradient | $50.0 - 250.0\,\text{mmol/m}^3$ | Warning Red ($< 60\,\mu\text{M}$) $\rightarrow$ Muted Cyan $\rightarrow$ Rich Azure |
| **Surface Currents ($u, v$)** | Speed Magnitude | $0.0 - 1.5\,\text{m/s}$ | Translucent Aqua $\rightarrow$ Bright Cyan $\rightarrow$ High-Energy Amber |

---

## 2. Fonts

### 2.1 Font Family Stacks
The platform relies on two dedicated typography stacks:

1. **Primary Interface Font (`var(--font-ui)`):**
   - **Recommended Google Font:** `Inter` or `Outfit`
   - **System Fallback:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif`
   - **Characteristics:** Neutral, highly legible at micro-sizes ($10 - 12\,\text{px}$), optimized for dense dashboards and multi-column tabular data.

2. **Technical & Telemetry Monospace Font (`var(--mono)`):**
   - **Primary Font:** `'JetBrains Mono', 'Fira Code'`
   - **System Fallback:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
   - **Characteristics:** Tabular numerical alignment, distinct character separation (`0` vs `O`, `1` vs `l`), essential for geographic coordinates ($13.0827^\circ$), timestamps, JSON payloads, and memory addresses.

---

## 3. Typography Hierarchy & Component Styles

### 3.1 Modular Type Scale

| Level | Size (rem / px) | Weight | Letter Spacing | Line Height | Application |
|:---|:---|:---|:---|:---|:---|
| **Display / Brand** | `1.05rem` (15px) | 800 (Bold) | `+0.2px` | 1.2 | Header brand mark (`🌊 oceanStream`) |
| **Panel Heading** | `0.78rem` (11px) | 700 (Semi-Bold) | `+0.3px` | 1.3 | Panel title bars, modal dialog headers |
| **UI Body / Inputs** | `0.74rem` (10.5px) | 500 (Medium) | `0px` | 1.4 | Controls, select boxes, form labels |
| **Telemetry / Data** | `0.72rem` (10px) | 600 (Mono) | `-0.2px` | 1.3 | Real-time coordinate HUD, WebSocket log |
| **Badge / Pill Tag** | `0.65rem` (9px) | 700 (Mono) | `+0.4px` | 1.0 | Status indicators, cache state badges |
| **Legend Scale** | `0.62rem` (8.5px) | 600 (Medium) | `0px` | 1.0 | Min/Max colorbar numbers, chart tick marks |

---

### 3.2 UI Component Style Specifications

#### 1. Panel & Container Cards
```css
.panel {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.panel-header {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 8px 12px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #ffffff;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```

#### 2. Interactive Buttons
```css
.btn {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 0.74rem;
  font-weight: 600;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease-in-out;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: 0 0 8px rgba(0, 200, 255, 0.2);
}
.btn.primary {
  background: #0077b6;
  border-color: var(--accent);
  color: #ffffff;
}
.btn.primary:hover {
  background: var(--accent);
  color: #000000;
}
```

#### 3. Floating Glassmorphism 3D HUD Toolbar
```css
#deck3dToolbar {
  background: rgba(13, 21, 37, 0.92);
  border: 1px solid var(--border-bright);
  border-radius: 8px;
  padding: 6px 10px;
  gap: 8px;
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}
```

#### 4. OS Virtual Memory Page Allocation Grid
```css
.memory-grid {
  display: grid;
  grid-template-columns: repeat(25, 1fr);
  gap: 2px;
  height: 28px;
}
.memory-cell.resident   { background: var(--green); box-shadow: 0 0 4px var(--green); }
.memory-cell.ondisk     { background: var(--orange); }
.memory-cell.fetching   { background: var(--amber); animation: pulse 1s infinite; }
.memory-cell.notfetched { background: var(--dark-page); }
```
