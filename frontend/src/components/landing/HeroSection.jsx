 import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { gsap } from 'gsap';

const EYEBROW = 'MINISTRY OF EARTH SCIENCES  ·  INCOIS  ·  SIH 2026';

export default function HeroSection() {
  const heroRef        = useRef(null);
  const eyebrowRef     = useRef(null);
  const titleRef       = useRef(null);
  const descriptionRef = useRef(null);
  const actionsRef     = useRef(null);
  const metaRef        = useRef(null);
  const videoRef = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Reduced-motion state
  // ─────────────────────────────────────────────────────────────────────────
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Video playback management
  //
  // Explicitly enforces DOM-level muted + defaultMuted properties required by
  // Chromium / WebKit autoplay security policies, attaches lifecycle event
  // triggers for reliable autoplay, and adds user interaction fallbacks.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) return;

    const video = videoRef.current;
    if (!video) return;

    // Enforce DOM properties directly on the element node
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.loop = true;

    const playVideo = () => {
      if (!video) return;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          console.warn("Video autoplay deferred until interaction:", e);
        });
      }
    };

    if (video.readyState >= 2) {
      playVideo();
    } else {
      video.addEventListener('loadedmetadata', playVideo, { once: true });
      video.addEventListener('canplay', playVideo, { once: true });
      video.addEventListener('loadeddata', playVideo, { once: true });
    }

    // Safety fallback: if browser held autoplay, trigger on first user scroll / touch
    const handleFirstGesture = () => {
      if (video && video.paused) {
        playVideo();
      }
      window.removeEventListener('scroll', handleFirstGesture);
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
    };

    window.addEventListener('scroll', handleFirstGesture, { passive: true, once: true });
    window.addEventListener('click', handleFirstGesture, { once: true });
    window.addEventListener('touchstart', handleFirstGesture, { passive: true, once: true });

    return () => {
      if (video) {
        video.removeEventListener('loadedmetadata', playVideo);
        video.removeEventListener('canplay', playVideo);
        video.removeEventListener('loadeddata', playVideo);
      }
      window.removeEventListener('scroll', handleFirstGesture);
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
    };
  }, [reducedMotion]);

  // ─────────────────────────────────────────────────────────────────────────
  // GSAP entrance animation
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) return;

    const hero = heroRef.current;
    if (!hero) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      const mediaEl = videoRef.current || hero.querySelector('.os-hero-image');

      if (mediaEl) {
        tl.fromTo(
          mediaEl,
          { scale: 1.06 },
          { scale: 1, duration: 2.4, ease: 'power2.out' }
        );
      }

      tl
        // Eyebrow label
        .fromTo(
          eyebrowRef.current,
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.65 },
          mediaEl ? '-=1.5' : 0
        )
        // Main heading — slightly larger movement for hierarchy
        .fromTo(
          titleRef.current,
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.9 },
          '-=0.45'
        )
        // Description paragraph
        .fromTo(
          descriptionRef.current,
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.65, ease: 'power2.out' },
          '-=0.52'
        )
        // CTA row
        .fromTo(
          actionsRef.current,
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out' },
          '-=0.38'
        )
        // Right-side editorial meta panel
        .fromTo(
          metaRef.current,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' },
          '-=0.28'
        );
    }, hero);

    return () => ctx.revert();
  }, [reducedMotion]);

  return (
    <section
      ref={heroRef}
      className="os-hero"
      aria-label="oceanStream introduction"
    >
      {/* ── Background media layer ────────────────────────────────────────── */}
      <div className="os-hero-media">
        {reducedMotion ? (
          /*
           * REDUCED-MOTION PATH
           * The <video> element is not mounted — static poster image is shown.
           */
          <img
            src="/prototype/images/ocean-hero.jpg"
            srcSet="/prototype/images/ocean-hero-mobile.jpg 768w, /prototype/images/ocean-hero.jpg 1920w"
            sizes="100vw"
            alt=""
            className="os-hero-image"
            aria-hidden="true"
            loading="eager"
            fetchPriority="high"
          />
        ) : (
          /*
           * STANDARD AUTOPLAY BACKGROUND VIDEO PATH
           */
          <video
            ref={videoRef}
            className="os-hero-video"
            autoPlay
            muted
            loop
            playsInline
            disablePictureInPicture
            preload="auto"
            poster="/prototype/images/ocean-hero.jpg"
            aria-hidden="true"
            style={{ pointerEvents: 'none' }}
          >
            {/* 1. Mobile MP4 (H.264, 720p, ~1.4MB) */}
            <source
              media="(max-width: 768px)"
              src="/prototype/images/ocean-hero-mobile.mp4"
              type="video/mp4"
            />
            {/* 2. Mobile WebM (VP9, 720p, ~1.5MB) */}
            <source
              media="(max-width: 768px)"
              src="/prototype/images/ocean-hero-mobile.webm"
              type="video/webm"
            />
            {/* 3. Desktop MP4 (H.264, 1080p, ~3.3MB) */}
            <source
              src="/prototype/images/ocean-hero.mp4"
              type="video/mp4"
            />
            {/* 4. Desktop WebM (VP9, 1080p, ~3.1MB) */}
            <source
              src="/prototype/images/ocean-hero.webm"
              type="video/webm"
            />
            {/* Hard fallback for browsers that do not support <video> */}
            <img
              src="/prototype/images/ocean-hero.jpg"
              srcSet="/prototype/images/ocean-hero-mobile.jpg 768w, /prototype/images/ocean-hero.jpg 1920w"
              sizes="100vw"
              alt=""
              className="os-hero-image"
            />
          </video>
        )}

        <div className="os-hero-overlay" />
        <div className="os-hero-vignette" />
      </div>

      {/* Minimal top navigation is supplied by LandingPage */}

      {/* ── Hero content ─────────────────────────────────────────────────── */}
      <div className="os-hero-inner">
        <div className="os-hero-copy">
          <div ref={eyebrowRef} className="os-hero-eyebrow">
            <span className="os-hero-eyebrow-line" />
            <span>{EYEBROW}</span>
          </div>

          <h1 ref={titleRef} className="os-hero-title">
            Explore the ocean
            <span>in four dimensions.</span>
          </h1>

          <p ref={descriptionRef} className="os-hero-description">
            A unified environment for exploring numerical ocean models,
            real-world observations and multidimensional marine data.
          </p>

          <div ref={actionsRef} className="os-hero-actions flex-wrap gap-3">
            <Link
              to="/explorer"
              onClick={() => {
                try { localStorage.setItem('oceanstream_mode', 'student'); } catch {}
              }}
              className="os-button os-button-primary flex items-center gap-2"
            >
              <span>🎓 Student 3D Dive</span>
              <ArrowUpRight size={17} strokeWidth={1.8} />
            </Link>

            <Link
              to="/explorer"
              onClick={() => {
                try { localStorage.setItem('oceanstream_mode', 'scientist'); } catch {}
              }}
              className="os-button os-button-quiet flex items-center gap-2 border border-violet-500/40 text-violet-200 hover:bg-violet-950/40"
            >
              <span>🔬 Scientist Workbench</span>
              <ArrowUpRight size={17} strokeWidth={1.8} />
            </Link>
          </div>
        </div>

        {/* Right-side editorial information */}
        <div ref={metaRef} className="os-hero-meta">
          <div className="os-hero-meta-number">04</div>

          <div className="os-hero-meta-line" />

          <div className="os-hero-meta-label">
            DIMENSIONS
          </div>

          <div className="os-hero-meta-items">
            <span>Latitude</span>
            <span>Longitude</span>
            <span>Depth</span>
            <span>Time</span>
          </div>
        </div>
      </div>

      <div className="os-hero-bottom">
        <span>OCEAN INTELLIGENCE PLATFORM</span>

        <a href="#challenge" aria-label="Scroll to explore the platform">
          Scroll to explore
          <ChevronDown size={15} />
        </a>

        <span>01 / 11</span>
      </div>
    </section>
  );
}