# Hero Video Asset — Placement Guide

## Current video in use

| Field      | Value                                                                 |
|------------|-----------------------------------------------------------------------|
| Title      | Bird's Eye View of Ocean Waves                                       |
| Creator    | Ruvim M                                                               |
| Source     | [Pexels #1918465](https://www.pexels.com/video/bird-s-eye-view-of-ocean-waves-1918465/) |
| License    | Pexels Free License (free to use, no attribution required)            |
| Resolution | 1080p (Desktop) / 720p (Mobile)                                       |
| Local files| `ocean-hero.mp4` (3.3MB), `ocean-hero.webm` (3.1MB), `ocean-hero-mobile.mp4` (1.48MB), `ocean-hero-mobile.webm` (1.59MB) |

---

## Active Video Assets

This directory contains the optimized, web-ready background assets:

```
public/prototype/images/
├── ocean-hero.webm          ← Desktop WebM VP9 (1080p, ~3.1 MB)
├── ocean-hero.mp4           ← Desktop MP4 H.264 (1080p, ~3.3 MB)
├── ocean-hero-mobile.webm   ← Mobile WebM VP9 (720p, ~1.59 MB)
├── ocean-hero-mobile.mp4    ← Mobile MP4 H.264 (720p, ~1.48 MB)
├── ocean-hero.jpg           ← Crisp 1080p poster fallback (~360 KB)
└── ocean-hero-mobile.jpg    ← Crisp 720p mobile poster (~170 KB)
```

The `<video>` element in `src/components/landing/HeroSection.jsx` uses
`preload="metadata"` and media query `<source>` elements so mobile devices
only download the lightweight 720p streams, while desktop devices load 1080p.

---

## Video requirements

| Property      | Requirement                                      |
|---------------|--------------------------------------------------|
| Duration      | 10–30 s recommended (loops seamlessly)           |
| Resolution    | 1920×1080 minimum; 3840×2160 (4K) preferred      |
| Frame rate    | 24–30 fps (higher is fine)                       |
| Audio         | **None / stripped** — video is always muted      |
| Colour space  | sRGB                                             |

## Recommended encoding

### WebM (primary — best quality/size ratio)
```
ffmpeg -i source.mp4 \
  -c:v libvpx-vp9 \
  -b:v 0 -crf 33 \
  -deadline best \
  -an \
  ocean-hero.webm
```

### MP4 H.264 (universal fallback)
```
ffmpeg -i source.mp4 \
  -c:v libx264 \
  -preset slow \
  -crf 23 \
  -movflags +faststart \
  -an \
  ocean-hero.mp4
```

> **Tip**: `faststart` moves the moov atom to the front of the MP4 so
> browsers can begin playing before the full file downloads.

---

## How it works

```
<video autoPlay muted loop playsInline
       poster="/prototype/images/ocean-hero.jpg">
  <source src="/prototype/images/ocean-hero.webm" type="video/webm" />
  <source src="/prototype/images/ocean-hero.mp4"  type="video/mp4"  />
  <!-- fallback img for no-video browsers -->
  <img src="/prototype/images/ocean-hero.jpg" alt="" />
</video>
```

- **poster** — shown instantly while the video downloads; also used when
  `prefers-reduced-motion: reduce` pauses playback.
- **WebM** is attempted first; MP4 is selected by browsers that do not
  support VP9 (older Safari, some Android).
- GSAP applies the same `scale(1.08 → 1)` zoom-in on the `<video>` element
  that it previously applied to the `<img>`.
- `prefers-reduced-motion` is respected: a JS `MediaQueryList` listener
  pauses the video and the GSAP entrance animation is skipped.

---

## During development (no video file yet)

The existing `ocean-hero.jpg` poster image is displayed as the background —
the hero looks and behaves identically to the previous image implementation.
No blank/broken state appears.
