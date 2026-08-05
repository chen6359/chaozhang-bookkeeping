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

type NpcCharacterProfile = {
  id: string;
  identity: string;
  age: string;
  build: string;
};

export const npcRankCharacterProfiles: Record<
  RankKey,
  Record<"comic" | "advisor", NpcCharacterProfile>
> = {
  county: {
    comic: {
      id: "county-grain-clerk",
      identity: "钱粮小吏",
      age: "青年",
      build: "精瘦灵活",
    },
    advisor: {
      id: "county-secretary",
      identity: "师爷",
      age: "中年",
      build: "清瘦儒雅",
    },
  },
  prefecture: {
    comic: {
      id: "prefecture-steward",
      identity: "府衙管事",
      age: "中年",
      build: "圆润利落",
    },
    advisor: {
      id: "prefecture-judge",
      identity: "通判",
      age: "中年",
      build: "端正沉稳",
    },
  },
  governor: {
    comic: {
      id: "governor-attendant",
      identity: "巡抚亲随",
      age: "壮年",
      build: "干练偏瘦",
    },
    advisor: {
      id: "provincial-treasurer",
      identity: "布政使",
      age: "中老年",
      build: "清癯严谨",
    },
  },
  regent: {
    comic: {
      id: "regent-chief-eunuch",
      identity: "内侍总管",
      age: "中老年",
      build: "略圆润",
    },
    advisor: {
      id: "grand-secretary",
      identity: "首辅",
      age: "老年",
      build: "挺拔威严",
    },
  },
  emperor: {
    comic: {
      id: "imperial-eunuch",
      identity: "御前太监",
      age: "老年",
      build: "清瘦敏捷",
    },
    advisor: {
      id: "revenue-minister",
      identity: "户部尚书",
      age: "中老年",
      build: "持重微胖",
    },
  },
};

export const npcCharacterFamilies: Record<
  NpcAssetRoute,
  NpcCharacterProfile
> = {
  comic: {
    id: "rank-specific-messenger",
    identity: "随官阶更换的急报班底",
    age: "随官阶变化",
    build: "以动作和体态强化急报感",
  },
  advisor: {
    id: "rank-specific-advisor",
    identity: "随官阶更换的谋士班底",
    age: "随官阶变化",
    build: "以沉稳体态强化谏言感",
  },
  "companion-female": {
    id: "female-companion",
    identity: "随行知己",
    age: "与主角共同成长",
    build: "温和自然",
  },
  "companion-male": {
    id: "male-companion",
    identity: "随行知己",
    age: "与主角共同成长",
    build: "温和自然",
  },
};

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
  characterId: string;
  identity: string;
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
  const profile =
    kind === "comic" || kind === "advisor"
      ? npcRankCharacterProfiles[rankKey][kind]
      : npcCharacterFamilies[route];

  return {
    src: getNpcAssetPath(route, rankKey, assetMood),
    assetMood,
    rankKey,
    route,
    characterId: profile.id,
    identity: profile.identity,
  };
}
