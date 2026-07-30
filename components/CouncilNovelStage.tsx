"use client";

import type { CSSProperties } from "react";
import { getNpcPortraitAsset, type NpcKind } from "../lib/characters";
import type { SceneMediaAsset } from "../lib/scene-media";
import { SceneMedia } from "./SceneMedia";
import styles from "./CouncilNovelStage.module.css";

export type CouncilNovelActorMood =
  | "neutral"
  | "success"
  | "warning"
  | "alarm"
  | "council"
  | "recovery";

export type CouncilNovelActor = {
  id: string;
  kind: NpcKind;
  name: string;
  /**
   * Optional standalone transparent portrait. When omitted, the rank-specific
   * portrait route is resolved from lib/characters.
   */
  portraitSrc?: string;
  mood?: CouncilNovelActorMood;
};

export type CouncilNovelDialogue = {
  actorId: string;
  text: string;
  tone?: string;
};

export type CouncilNovelProgress = {
  current: number;
  total: number;
  label?: string;
};

type CouncilNovelStageProps = {
  backdrop: SceneMediaAsset | string;
  actors: CouncilNovelActor[];
  /** Actor id that is currently speaking. */
  activeActor: string;
  dialogue: CouncilNovelDialogue | CouncilNovelDialogue[];
  progress?: CouncilNovelProgress;
  rank: string;
  presentation: string;
  eyebrow?: string;
  title?: string;
  className?: string;
};

const isSceneMediaAsset = (
  backdrop: SceneMediaAsset | string,
): backdrop is SceneMediaAsset => typeof backdrop !== "string";

const normalizeDialogue = (
  dialogue: CouncilNovelDialogue | CouncilNovelDialogue[],
) => (Array.isArray(dialogue) ? dialogue : [dialogue]);

export function CouncilNovelStage({
  backdrop,
  actors,
  activeActor,
  dialogue,
  progress,
  rank,
  presentation,
  eyebrow = "堂上奏对",
  title = "本次账情",
  className = "",
}: CouncilNovelStageProps) {
  const visibleActors = actors.slice(0, 3);
  const activeActorExists = visibleActors.some(
    (actor) => actor.id === activeActor,
  );
  const focusedActor = activeActorExists
    ? activeActor
    : (visibleActors[0]?.id ?? "");
  const dialogueItems = normalizeDialogue(dialogue);
  const activeDialogue =
    dialogueItems.find((item) => item.actorId === focusedActor) ??
    dialogueItems[0];
  const activeActorData = visibleActors.find(
    (actor) => actor.id === activeDialogue?.actorId,
  );
  const showDialogueEnsemble = dialogueItems.length > 1;

  const rootStyle = {
    "--council-actor-count": Math.max(visibleActors.length, 1),
  } as CSSProperties;

  return (
    <section
      className={`${styles.stage} ${className}`.trim()}
      style={rootStyle}
      data-testid="council-novel-stage"
      data-active-actor={focusedActor}
      data-actor-count={visibleActors.length}
      aria-label={`${title}，视觉小说式朝会`}
    >
      <div className={styles.backdrop} aria-hidden="true">
        {isSceneMediaAsset(backdrop) ? (
          <SceneMedia
            media={backdrop}
            className={styles.backdropMedia}
            eagerPoster
          />
        ) : (
          // Portrait and scene files are local product assets and intentionally
          // bypass framework image transforms in this prototype.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={backdrop} alt="" draggable={false} />
        )}
      </div>
      <div className={styles.scrim} aria-hidden="true" />

      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {progress && (
          <div
            className={styles.progress}
            aria-label={`${progress.label ?? "朝会议程"} ${progress.current}/${progress.total}`}
          >
            <span>{progress.label ?? "朝会议程"}</span>
            <strong>
              {progress.current}/{progress.total}
            </strong>
          </div>
        )}
      </header>

      <div className={styles.cast} aria-label="本轮参议角色">
        {visibleActors.map((actor) => {
          const isActive = actor.id === focusedActor;
          const asset = actor.portraitSrc
            ? null
            : getNpcPortraitAsset(
                actor.kind,
                rank,
                presentation,
                actor.mood ?? "council",
              );
          const portraitSrc = actor.portraitSrc ?? asset?.src ?? "";

          return (
            <figure
              key={actor.id}
              className={`${styles.actor} ${isActive ? styles.activeActor : styles.supportingActor}`}
              data-actor-id={actor.id}
              data-role-kind={actor.kind}
              data-active={isActive ? "true" : "false"}
            >
              <div className={styles.portrait}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={portraitSrc}
                  alt={`${actor.name}角色立绘`}
                  draggable={false}
                />
              </div>
              <figcaption>{actor.name}</figcaption>
            </figure>
          );
        })}
      </div>

      {activeDialogue && (
        <div
          className={`${styles.dialogue} ${showDialogueEnsemble ? styles.ensembleDialogue : ""}`}
          data-dialogue-count={dialogueItems.length}
        >
          {showDialogueEnsemble ? (
            <div className={styles.dialogueGrid}>
              {dialogueItems.slice(0, 3).map((item) => {
                const actor = visibleActors.find(
                  (candidate) => candidate.id === item.actorId,
                );
                return (
                  <article
                    className={`${styles.dialogueItem} ${item.actorId === focusedActor ? styles.activeDialogue : ""}`}
                    key={`${item.actorId}-${item.tone ?? "line"}`}
                    data-dialogue-actor={item.actorId}
                  >
                    <div className={styles.speaker}>
                      <strong>{actor?.name ?? "奏报"}</strong>
                      {item.tone && <span>{item.tone}</span>}
                    </div>
                    <p>“{item.text}”</p>
                  </article>
                );
              })}
            </div>
          ) : (
            <>
              <div className={styles.speaker}>
                <strong>{activeActorData?.name ?? "奏报"}</strong>
                {activeDialogue.tone && <span>{activeDialogue.tone}</span>}
              </div>
              <p>“{activeDialogue.text}”</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

