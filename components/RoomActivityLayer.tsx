import type { CSSProperties } from "react";
import {
  getNpcPortraitAsset,
  type NpcAssetMood,
} from "../lib/characters";
import type {
  FiscalStateKey,
  RoomKey,
} from "../lib/world";
import styles from "./RoomActivityLayer.module.css";

type RoomActivityLayerProps = {
  room: RoomKey;
  fiscalState: FiscalStateKey;
  rank: string;
  presentation?: string;
  className?: string;
};

type ActivityMotion =
  | "walk"
  | "carry"
  | "count"
  | "bow"
  | "advise"
  | "listen"
  | "haul"
  | "hammer"
  | "inspect";

type ActivityAccessory = "crate" | "ledger" | "plank" | "hammer";

type ActivityActor = {
  id: string;
  src: string;
  label: string;
  motion: ActivityMotion;
  accessory?: ActivityAccessory;
  reverse?: boolean;
};

type ActivityStyle = CSSProperties & {
  "--activity-duration": string;
  "--activity-delay": string;
};

const activityCounts: Record<FiscalStateKey, number> = {
  stable: 3,
  strained: 2,
  deficit: 1,
};

const stateDurations: Record<FiscalStateKey, number> = {
  stable: 3.5,
  strained: 4.2,
  deficit: 4.8,
};

function getNpcMood(fiscalState: FiscalStateKey): NpcAssetMood {
  return fiscalState === "stable" ? "success" : "warning";
}

function getActivityActors({
  room,
  fiscalState,
  rank,
  presentation,
}: Omit<RoomActivityLayerProps, "className">): ActivityActor[] {
  const mood = getNpcMood(fiscalState);
  const comic = getNpcPortraitAsset(
    "comic",
    rank,
    presentation ?? "暂不设置",
    mood,
  );
  const advisor = getNpcPortraitAsset(
    "advisor",
    rank,
    presentation ?? "暂不设置",
    mood,
  );
  const companion = getNpcPortraitAsset(
    "companion",
    rank,
    presentation ?? "暂不设置",
    fiscalState === "stable" ? "success" : "neutral",
  );

  switch (room) {
    case "hall":
      return [
        {
          id: "hall-runner",
          src: comic.src,
          label: `${comic.identity}往返送簿`,
          motion: "walk",
          accessory: "ledger",
        },
        {
          id: "hall-clerk",
          src: advisor.src,
          label: `${advisor.identity}核阅公文`,
          motion: "count",
          accessory: "ledger",
        },
        {
          id: "hall-visitor",
          src: companion.src,
          label: "来访者等候回话",
          motion: "listen",
          reverse: true,
        },
      ];
    case "treasury":
      return [
        {
          id: "treasury-porter",
          src: comic.src,
          label: `${comic.identity}搬运箱笼`,
          motion: "carry",
          accessory: "crate",
        },
        {
          id: "treasury-clerk",
          src: advisor.src,
          label: `${advisor.identity}清点入库`,
          motion: "count",
          accessory: "ledger",
        },
        {
          id: "treasury-second-porter",
          src: companion.src,
          label: "伴侣协助核看封箱",
          motion: "carry",
          accessory: "crate",
          reverse: true,
        },
      ];
    case "council":
      return [
        {
          id: "council-advisor",
          src: advisor.src,
          label: `${advisor.identity}出列陈奏`,
          motion: "advise",
          accessory: "ledger",
        },
        {
          id: "council-messenger",
          src: comic.src,
          label: `${comic.identity}躬身回禀`,
          motion: "bow",
        },
        {
          id: "council-companion",
          src: companion.src,
          label: "伴侣在旁听议",
          motion: "listen",
          reverse: true,
        },
      ];
    case "works":
      return [
        {
          id: "works-porter",
          src: comic.src,
          label: `${comic.identity}催运木料`,
          motion: "haul",
          accessory: "plank",
        },
        {
          id: "works-carpenter",
          src: companion.src,
          label: "伴侣查看榫卯施工",
          motion: "hammer",
          accessory: "hammer",
        },
        {
          id: "works-overseer",
          src: advisor.src,
          label: `${advisor.identity}核对营造图纸`,
          motion: "inspect",
          accessory: "ledger",
          reverse: true,
        },
      ];
  }
}

export function RoomActivityLayer({
  room,
  fiscalState,
  rank,
  presentation = "暂不设置",
  className = "",
}: RoomActivityLayerProps) {
  const actorCount = activityCounts[fiscalState];
  const actors = getActivityActors({
    room,
    fiscalState,
    rank,
    presentation,
  }).slice(0, actorCount);
  const baseDuration = stateDurations[fiscalState];

  return (
    <div
      className={[
        styles.layer,
        styles[room],
        styles[fiscalState],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-room-activity={room}
      data-activity-state={fiscalState}
      data-activity-count={actorCount}
      aria-hidden="true"
    >
      {actors.map((actor, index) => {
        const actorDuration = Math.min(
          5,
          baseDuration + index * 0.22,
        );
        const actorStyle: ActivityStyle = {
          "--activity-duration": `${actorDuration}s`,
          "--activity-delay": `${index * -0.86}s`,
        };

        return (
          <div
            key={actor.id}
            className={[
              styles.actor,
              styles[`slot${index + 1}`],
              styles[actor.motion],
              actor.reverse ? styles.reverse : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={actorStyle}
            data-activity-role={actor.id}
            data-activity-motion={actor.motion}
            data-activity-label={actor.label}
            data-loop-seconds={actorDuration}
          >
            {/* The source files are local transparent full-body cutouts. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={actor.src}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
            {actor.accessory && (
              <i
                className={[
                  styles.accessory,
                  styles[actor.accessory],
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
