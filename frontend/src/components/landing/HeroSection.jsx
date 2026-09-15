 import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { gsap } from 'gsap';

const eyebrow = 'MINISTRY OF EARTH SCIENCES  ·  INCOIS  ·  SIH 2026';

export default function HeroSection() {
  const heroRef = useRef(null);
  const eyebrowRef = useRef(null);
  const titleRef = useRef(null);
  const descriptionRef = useRef(null);
  const actionsRef = useRef(null);
  const metaRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => {
    const hero = heroRef.current;

    if (!hero) return;

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (reduceMotion) {
      gsap.set(
        [
          eyebrowRef.current,
          titleRef.current,
          descriptionRef.current,
          actionsRef.current,
          metaRef.current,
          imageRef.current,
        ],
        { opacity: 1, y: 0 }
      );
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: {
          ease: 'power3.out',
        },
      });

      tl.fromTo(
        imageRef.current,
        { scale: 1.08 },
        {
          scale: 1,
          duration: 2,
          ease: 'power2.out',
        }
      )
        .fromTo(
          eyebrowRef.current,
          { opacity: 0, y: 20 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
          },
          '-=1.3'
        )
        .fromTo(
          titleRef.current,
          { opacity: 0, y: 45 },
          {
            opacity: 1,
            y: 0,
            duration: 1,
          },
          '-=0.45'
        )
        .fromTo(
          descriptionRef.current,
          { opacity: 0, y: 25 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
          },
          '-=0.55'
        )
        .fromTo(
          actionsRef.current,
          { opacity: 0, y: 20 },
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
          },
          '-=0.4'
        )
        .fromTo(
          metaRef.current,
          { opacity: 0, y: 15 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
          },
          '-=0.25'
        );
    }, hero);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={heroRef}
      className="os-hero"
      aria-label="oceanStream introduction"
    >
      {/* Full-screen photographic background */}
      <div className="os-hero-media">
        <img
          ref={imageRef}
          src="/prototype/images/ocean-hero.jpg"
          alt=""
          className="os-hero-image"
        />

        <div className="os-hero-overlay" />
        <div className="os-hero-vignette" />
      </div>

      {/* Minimal top navigation is supplied by LandingPage */}

      <div className="os-hero-inner">
        <div className="os-hero-copy">
          <div ref={eyebrowRef} className="os-hero-eyebrow">
            <span className="os-hero-eyebrow-line" />
            <span>{eyebrow}</span>
          </div>

          <h1 ref={titleRef} className="os-hero-title">
            Explore the ocean
            <span>in four dimensions.</span>
          </h1>

          <p ref={descriptionRef} className="os-hero-description">
            A unified environment for exploring numerical ocean models,
            real-world observations and multidimensional marine data.
          </p>

          <div ref={actionsRef} className="os-hero-actions">
            <Link to="/explorer" className="os-button os-button-primary">
              Explore the Ocean
              <ArrowUpRight size={17} strokeWidth={1.8} />
            </Link>

            <a href="#challenge" className="os-button os-button-quiet">
              Discover the platform
              <ChevronDown size={16} strokeWidth={1.7} />
            </a>
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