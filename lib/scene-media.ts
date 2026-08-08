import {
  getSceneSprite,
  normalizeRank,
  type FiscalStateKey,
  type RankKey,
  type RoomKey,
} from "./world.ts";
import { publicAsset } from "./public-asset.ts";

export type SceneMediaAsset = {
  id: `${RankKey}.${RoomKey}.${FiscalStateKey}`;
  poster: string;
  posterBackgroundSize?: string;
  posterBackgroundPosition?: string;
  webm: string | null;
  mp4: string | null;
};

export type CountySceneMediaKey =
  `county.${RoomKey}.${FiscalStateKey}`;

const countySceneAsset = (
  room: RoomKey,
  fiscalState: FiscalStateKey,
): SceneMediaAsset => ({
  id: `county.${room}.${fiscalState}`,
  poster: publicAsset(`/scenes/county/${room}/${fiscalState}/poster.webp`),
  webm: publicAsset(`/scenes/county/${room}/${fiscalState}/loop.webm`),
  mp4: publicAsset(`/scenes/county/${room}/${fiscalState}/loop.mp4`),
});

/**
 * The county pilot is an explicit 4-room × 3-fiscal-state media contract.
 * Every scene includes an independent poster and reviewed 4-second loop.
 */
export const countySceneMediaAssets: Record<
  CountySceneMediaKey,
  SceneMediaAsset
> = {
  "county.hall.stable": countySceneAsset("hall", "stable"),
  "county.hall.strained": countySceneAsset("hall", "strained"),
  "county.hall.deficit": countySceneAsset("hall", "deficit"),
  "county.treasury.stable": countySceneAsset("treasury", "stable"),
  "county.treasury.strained": countySceneAsset("treasury", "strained"),
  "county.treasury.deficit": countySceneAsset("treasury", "deficit"),
  "county.council.stable": countySceneAsset("council", "stable"),
  "county.council.strained": countySceneAsset("council", "strained"),
  "county.council.deficit": countySceneAsset("council", "deficit"),
  "county.works.stable": countySceneAsset("works", "stable"),
  "county.works.strained": countySceneAsset("works", "strained"),
  "county.works.deficit": countySceneAsset("works", "deficit"),
};

export function getSceneMediaAsset(
  rank: string | RankKey,
  room: RoomKey,
  fiscalState: FiscalStateKey,
): SceneMediaAsset {
  const rankKey = normalizeRank(rank);
  const id = `${rankKey}.${room}.${fiscalState}` as SceneMediaAsset["id"];

  if (rankKey === "county") {
    return countySceneMediaAssets[id as CountySceneMediaKey];
  }

  const sprite = getSceneSprite(rankKey, room, fiscalState);
  return {
    id,
    poster: sprite.src,
    posterBackgroundSize: sprite.backgroundSize,
    posterBackgroundPosition: sprite.backgroundPosition,
    webm: null,
    mp4: null,
  };
}
