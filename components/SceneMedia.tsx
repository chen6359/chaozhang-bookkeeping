"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { SceneMediaAsset } from "../lib/scene-media";

type SceneMediaProps = {
  media: SceneMediaAsset;
  className?: string;
  eagerPoster?: boolean;
  controls?: boolean;
};

export function SceneMedia({
  media,
  className = "",
  eagerPoster = false,
  controls = false,
}: SceneMediaProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shouldLoadMotion, setShouldLoadMotion] = useState(false);
  const [isInViewport, setIsInViewport] = useState(false);
  const [pageIsVisible, setPageIsVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);
  const [readyMediaId, setReadyMediaId] = useState<string | null>(null);
  const [failedMediaId, setFailedMediaId] = useState<string | null>(null);
  const hasMotion = Boolean(media.webm || media.mp4);
  const motionReady = readyMediaId === media.id;
  const motionFailed = failedMediaId === media.id;

  const posterStyle = useMemo<CSSProperties | undefined>(
    () =>
      media.posterBackgroundSize
        ? {
            backgroundImage: `url("${media.poster}")`,
            backgroundPosition: media.posterBackgroundPosition,
            backgroundRepeat: "no-repeat",
            backgroundSize: media.posterBackgroundSize,
          }
        : undefined,
    [
      media.poster,
      media.posterBackgroundPosition,
      media.posterBackgroundSize,
    ],
  );

  useEffect(() => {
    const root = rootRef.current;
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const syncMotionPreference = () => {
      setPrefersReducedMotion(motionPreference.matches);
      if (motionPreference.matches) {
        setShouldLoadMotion(false);
        setIsInViewport(false);
      }
    };
    const syncPageVisibility = () => {
      setPageIsVisible(document.visibilityState === "visible");
    };

    syncMotionPreference();
    syncPageVisibility();
    motionPreference.addEventListener("change", syncMotionPreference);
    document.addEventListener("visibilitychange", syncPageVisibility);

    if (!root || !hasMotion || motionPreference.matches) {
      return () => {
        motionPreference.removeEventListener("change", syncMotionPreference);
        document.removeEventListener("visibilitychange", syncPageVisibility);
      };
    }

    if (typeof IntersectionObserver === "undefined") {
      const frameId = requestAnimationFrame(() => {
        setShouldLoadMotion(true);
        setIsInViewport(true);
      });
      return () => {
        cancelAnimationFrame(frameId);
        motionPreference.removeEventListener("change", syncMotionPreference);
        document.removeEventListener("visibilitychange", syncPageVisibility);
      };
    }

    const preloadObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoadMotion(true);
          preloadObserver.disconnect();
        }
      },
      { rootMargin: "320px 0px" },
    );
    const playbackObserver = new IntersectionObserver(
      ([entry]) => setIsInViewport(entry.isIntersecting),
      { threshold: 0.05 },
    );

    preloadObserver.observe(root);
    playbackObserver.observe(root);

    return () => {
      preloadObserver.disconnect();
      playbackObserver.disconnect();
      motionPreference.removeEventListener("change", syncMotionPreference);
      document.removeEventListener("visibilitychange", syncPageVisibility);
    };
  }, [hasMotion, prefersReducedMotion]);

  const shouldRenderMotion =
    hasMotion &&
    shouldLoadMotion &&
    !prefersReducedMotion &&
    !motionFailed;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (motionReady && isInViewport && pageIsVisible) {
      void video.play().catch(() => {
        // The poster remains visible if a browser blocks autoplay.
      });
    } else {
      video.pause();
    }
  }, [
    isInViewport,
    media.id,
    motionReady,
    pageIsVisible,
    shouldRenderMotion,
  ]);

  return (
    <div
      ref={rootRef}
      className={`scene-media ${className}`.trim()}
      data-scene-media={media.id}
      data-motion={
        !hasMotion
          ? "poster"
          : prefersReducedMotion
            ? "reduced"
            : motionFailed
              ? "fallback"
            : motionReady
              ? isInViewport && pageIsVisible
                ? "playing"
                : "paused"
              : "loading"
      }
      aria-hidden={controls ? undefined : true}
    >
      {posterStyle ? (
        <div className="scene-media-poster" style={posterStyle} />
      ) : (
        // This poster must remain a native image so it can be shared with the
        // video element without adding a framework-specific loader contract.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="scene-media-poster"
          src={media.poster}
          alt=""
          loading={eagerPoster ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
        />
      )}
      {shouldRenderMotion && (
        <video
          key={media.id}
          ref={videoRef}
          className={`scene-media-video ${motionReady ? "ready" : ""}`}
          poster={media.poster}
          muted
          loop
          playsInline
          controls={controls}
          preload="metadata"
          tabIndex={controls ? 0 : -1}
          onCanPlay={() => setReadyMediaId(media.id)}
          onError={() => setFailedMediaId(media.id)}
        >
          {media.webm && <source src={media.webm} type="video/webm" />}
          {media.mp4 && <source src={media.mp4} type="video/mp4" />}
        </video>
      )}
    </div>
  );
}
