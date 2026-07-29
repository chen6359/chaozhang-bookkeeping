import React from "react";
import {
  AbsoluteFill,
  Composition,
  Img,
  interpolate,
  registerRoot,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type FiscalState = "stable" | "strained" | "deficit";
type Room = "hall" | "treasury" | "council" | "works";

type SceneLoopProps = {
  imagePath: string;
  state: FiscalState;
  room: Room;
};

const PARTICLES = Array.from({ length: 28 }, (_, index) => ({
  x: ((index * 43) % 101) / 100,
  y: ((index * 67 + 13) % 103) / 100,
  size: 1.5 + (index % 4) * 0.8,
  phase: (index * 0.71) % (Math.PI * 2),
  opacity: 0.12 + (index % 5) * 0.025,
}));

function SceneLoop({ imagePath, state, room }: SceneLoopProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = frame / Math.max(1, durationInFrames - 1);
  const cycle = progress * Math.PI * 2;

  const roomPhase = {
    hall: 0,
    treasury: Math.PI * 0.32,
    council: Math.PI * 0.61,
    works: Math.PI * 0.94,
  }[room];

  const stateMotion = {
    stable: { travel: 9, scale: 1.032, glow: 0.15, dust: 1 },
    strained: { travel: 6, scale: 1.026, glow: 0.09, dust: 0.82 },
    deficit: { travel: 4, scale: 1.021, glow: 0.035, dust: 1.18 },
  }[state];

  const translateX = Math.sin(cycle + roomPhase) * stateMotion.travel;
  const translateY = Math.sin(cycle * 2 + roomPhase) * stateMotion.travel * 0.34;
  const scale =
    stateMotion.scale +
    Math.sin(cycle + roomPhase) * (state === "stable" ? 0.004 : 0.0025);
  const brightness =
    1 +
    Math.sin(cycle * 2 + roomPhase) *
      (state === "stable" ? 0.018 : state === "strained" ? 0.01 : 0.006);

  const warmLightX = interpolate(Math.sin(cycle), [-1, 1], [26, 74]);
  const hazeOpacity =
    stateMotion.glow *
    interpolate(Math.sin(cycle * 2 + roomPhase), [-1, 1], [0.56, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#17130f", overflow: "hidden" }}>
      <Img
        src={staticFile(imagePath)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          scale,
          translate: `${translateX}px ${translateY}px`,
          filter: `brightness(${brightness}) saturate(${
            state === "deficit" ? 0.86 : state === "strained" ? 0.94 : 1.04
          }) contrast(${state === "deficit" ? 1.06 : 1.02})`,
        }}
      />

      <AbsoluteFill
        style={{
          opacity: hazeOpacity,
          background: `radial-gradient(circle at ${warmLightX}% 38%, rgba(255,226,169,${
            state === "stable" ? 0.46 : 0.22
          }) 0%, rgba(255,219,155,0.08) 28%, transparent 62%)`,
          mixBlendMode: "screen",
        }}
      />

      <AbsoluteFill aria-hidden="true">
        {PARTICLES.map((particle, index) => {
          const x =
            particle.x * 1280 +
            Math.sin(cycle + particle.phase) *
              (state === "deficit" ? 15 : 8);
          const y =
            particle.y * 720 +
            Math.sin(cycle * 2 + particle.phase) *
              (state === "deficit" ? 18 : 10);
          return (
            <span
              key={index}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: particle.size,
                height:
                  state === "deficit" && room === "hall"
                    ? particle.size * 4.2
                    : particle.size,
                borderRadius: 999,
                background:
                  state === "stable"
                    ? "rgba(255,233,183,0.9)"
                    : state === "strained"
                      ? "rgba(226,210,180,0.75)"
                      : "rgba(205,213,210,0.7)",
                opacity: particle.opacity * stateMotion.dust,
                translate: `${x}px ${y}px`,
                rotate:
                  state === "deficit" && room === "hall" ? "-12deg" : "0deg",
                boxShadow:
                  state === "stable"
                    ? "0 0 8px rgba(255,221,151,0.5)"
                    : "none",
              }}
            />
          );
        })}
      </AbsoluteFill>

      {state === "deficit" ? (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(circle at center, transparent 42%, rgba(14,16,15,0.34) 100%)",
            opacity: 0.82,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
}

function RemotionRoot() {
  return (
    <Composition
      id="CountySceneLoop"
      component={SceneLoop}
      durationInFrames={96}
      fps={24}
      width={1280}
      height={720}
      defaultProps={{
        imagePath: "world/county/hall/stable/source.png",
        state: "stable",
        room: "hall",
      }}
    />
  );
}

registerRoot(RemotionRoot);
