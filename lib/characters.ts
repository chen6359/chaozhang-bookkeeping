import {
  getRankConfig,
  type RankKey,
} from "./world.ts";

export const npcAssetRoutes = [
  "comic",
  "advisor",
  "companion-female",
  "companion-male",
] as const;

export const npcAssetMoods = ["neutral", "warning", "success"] as const;

export type NpcAssetRoute = (typeof npcAssetRoutes)[number];
export type NpcAssetMood = (typeof npcAssetMoods)[number];
export type NpcKind = "comic" | "advisor" | "companion";

export function getNpcAssetPath(
  route: NpcAssetRoute,
  rank: string | RankKey,
  mood: NpcAssetMood,
): string {
  const rankKey = getRankConfig(rank).key;
  return `/characters/npc/${route}/${rankKey}/${mood}.webp`;
}

export function getNpcPortraitAsset(
  kind: NpcKind,
  rank: string | RankKey,
  presentation: string,
  mood: string,
): {
  src: string;
  assetMood: NpcAssetMood;
  rankKey: RankKey;
  route: NpcAssetRoute;
} {
  const rankKey = getRankConfig(rank).key;
  const assetMood: NpcAssetMood =
    mood === "warning" || mood === "alarm"
      ? "warning"
      : mood === "success" || mood === "recovery"
        ? "success"
        : "neutral";
  const companionGender = presentation === "女性" ? "male" : "female";
  const route: NpcAssetRoute =
    kind === "comic"
      ? "comic"
      : kind === "advisor"
        ? "advisor"
        : `companion-${companionGender}`;

  return {
    src: getNpcAssetPath(route, rankKey, assetMood),
    assetMood,
    rankKey,
    route,
  };
}
