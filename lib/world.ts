export const rankKeys = [
  "county",
  "prefecture",
  "governor",
  "regent",
  "emperor",
] as const;

export type RankKey = (typeof rankKeys)[number];
export type RankTheme = RankKey;

export const roomKeys = ["hall", "treasury", "council", "works"] as const;

export type RoomKey = (typeof roomKeys)[number];
export type FiscalStateKey = "stable" | "strained" | "deficit";
export type CharacterGender = "male" | "female";

export type FiscalStateCopy = {
  label: string;
  title: string;
  description: string;
};

export type RoomConfig = {
  key: RoomKey;
  genericName: string;
  name: string;
  description: string;
  visualAnchor: string;
  navigationLabel: string;
};

export type RankConfig = {
  key: RankKey;
  theme: RankTheme;
  index: number;
  displayName: string;
  maleName: string;
  femaleName: string;
  aliases: readonly string[];
  residenceName: string;
  treasuryName: string;
  emergencyName: string;
  buildingScale: string;
  architecture: string;
  attire: string;
  poses: Record<FiscalStateKey, string>;
  sceneAsset: string;
  portraitAssets: Record<
    CharacterGender,
    Record<FiscalStateKey, string>
  >;
  rooms: Record<RoomKey, RoomConfig>;
};

export type SceneSprite = {
  id: `${RankKey}.${RoomKey}.${FiscalStateKey}`;
  src: string;
  fiscalColumn: number;
  roomRow: number;
  backgroundSize: "300% 400%";
  backgroundPosition: string;
};

const createPortraitAssets = (
  rank: RankKey,
): RankConfig["portraitAssets"] => ({
  male: {
    stable: `/characters/player/male/${rank}/stable.webp`,
    strained: `/characters/player/male/${rank}/strained.webp`,
    deficit: `/characters/player/male/${rank}/deficit.webp`,
  },
  female: {
    stable: `/characters/player/female/${rank}/stable.webp`,
    strained: `/characters/player/female/${rank}/strained.webp`,
    deficit: `/characters/player/female/${rank}/deficit.webp`,
  },
});

export const roomConfigs: Record<
  RoomKey,
  Pick<RoomConfig, "key" | "genericName" | "navigationLabel">
> = {
  hall: {
    key: "hall",
    genericName: "大堂",
    navigationLabel: "进入大堂",
  },
  treasury: {
    key: "treasury",
    genericName: "库房",
    navigationLabel: "查看库房",
  },
  council: {
    key: "council",
    genericName: "议事厅",
    navigationLabel: "前往议事厅",
  },
  works: {
    key: "works",
    genericName: "营造院",
    navigationLabel: "前往营造院",
  },
};

export const rankConfigs: readonly RankConfig[] = [
  {
    key: "county",
    theme: "county",
    index: 0,
    displayName: "从九品县令",
    maleName: "从九品县令",
    femaleName: "从九品县令",
    aliases: ["从九品县令", "县令", "从九品"],
    residenceName: "县衙",
    treasuryName: "县库",
    emergencyName: "县署急奏",
    buildingScale: "一进县衙，正堂、两侧属房和营造后院组成紧凑县治。",
    architecture: "灰瓦青砖、木柱、素色匾额和少量县治器具。",
    attire: "青绿与赭色窄袖官袍、小型乌纱冠、木质腰牌。",
    poses: {
      stable: "站立迎向用户，一手持账簿，一手示意县衙运转。",
      strained: "微微前倾核对账册，眉头收紧，手边摊开支出单。",
      deficit: "收紧袖口并抱住修缮清单，神情坚定而非沮丧。",
    },
    sceneAsset: "/world-county-rooms.jpg",
    portraitAssets: createPortraitAssets("county"),
    rooms: {
      hall: {
        ...roomConfigs.hall,
        name: "县衙大堂",
        description: "本周期收支、消费池、县库账面和风险的主页总览。",
        visualAnchor: "一进院、鼓架、三开间正堂和朴素公案。",
      },
      treasury: {
        ...roomConfigs.treasury,
        name: "县库账房",
        description: "查看县库公式、流水和储蓄记录。",
        visualAnchor: "木格账架、三只铁箍木箱、算盘桌和县库双锁。",
      },
      council: {
        ...roomConfigs.council,
        name: "县署议事厅",
        description: "查看七天奏报、角色讨论和处理选择。",
        visualAnchor: "小型县境舆图、三席议事案、卷宗墙和侧窗灯。",
      },
      works: {
        ...roomConfigs.works,
        name: "营造后院",
        description: "查看储蓄目标、县学藏书阁建设进度和空间解锁。",
        visualAnchor: "藏书阁基址、木料架、小脚手架和工匠案桌。",
      },
    },
  },
  {
    key: "prefecture",
    theme: "prefecture",
    index: 1,
    displayName: "知府",
    maleName: "知府",
    femaleName: "知府",
    aliases: ["知府", "州府"],
    residenceName: "府衙",
    treasuryName: "府库",
    emergencyName: "州府急奏",
    buildingScale: "两至三进州府，拥有完整仪门、回廊、前后院和专门属房。",
    architecture: "深色木构、规整石阶、成组灯笼和州府印屏。",
    attire: "深蓝或绛红官袍、宽腰带、正式冠帽和玉质腰牌。",
    poses: {
      stable: "正立于仪门轴线，手持笏板或府印，姿态沉稳。",
      strained: "侧身查看府库清册，另一手指向需要收缩的项目。",
      deficit: "手持封存清单与修缮令，在空出的陈设位前主持止损。",
    },
    sceneAsset: "/world-prefecture-rooms.jpg",
    portraitAssets: createPortraitAssets("prefecture"),
    rooms: {
      hall: {
        ...roomConfigs.hall,
        name: "州府大堂",
        description: "本周期州府财政、府库账面和风险的主页总览。",
        visualAnchor: "仪门、两重回廊、五开间正堂和州府印屏。",
      },
      treasury: {
        ...roomConfigs.treasury,
        name: "府库账房",
        description: "查看府库公式、流水和储蓄记录。",
        visualAnchor: "砖券库门、成排仓廒格、封签柜和大型总账案。",
      },
      council: {
        ...roomConfigs.council,
        name: "州府议事厅",
        description: "查看七天奏报、正式府议和处理选择。",
        visualAnchor: "州境壁图、长案六席、幕僚侧案和议程屏。",
      },
      works: {
        ...roomConfigs.works,
        name: "营造院",
        description: "查看储蓄目标、州学或桥渠建设阶段。",
        visualAnchor: "独立院门、图纸亭、材料棚和州学／桥渠模型。",
      },
    },
  },
  {
    key: "governor",
    theme: "governor",
    index: 2,
    displayName: "巡抚",
    maleName: "巡抚",
    femaleName: "巡抚",
    aliases: ["巡抚", "督抚"],
    residenceName: "行辕",
    treasuryName: "藩库",
    emergencyName: "督署急奏",
    buildingScale: "多进督府或行辕，拥有完整中轴、幕僚院、辖地图亭和仪仗区。",
    architecture: "高台基、深檐、成组院落、区域地图和沙盘。",
    attire: "墨蓝近黑官袍配金铜边、较高冠帽、正式玉带和辖地卷轴。",
    poses: {
      stable: "立于辖地沙盘旁展开卷轴，以开放手势调度属官。",
      strained: "双手压住摊开的区域账图，神情严肃但姿态稳定。",
      deficit: "一手执修复次序，一手按住撤项图，体现承担而非失势。",
    },
    sceneAsset: "/world-governor-rooms.jpg",
    portraitAssets: createPortraitAssets("governor"),
    rooms: {
      hall: {
        ...roomConfigs.hall,
        name: "督府中堂",
        description: "查看辖区财政、藩库账面和风险的主页总览。",
        visualAnchor: "高台中堂、仪仗旗、辖地图亭和多进院轴线。",
      },
      treasury: {
        ...roomConfigs.treasury,
        name: "藩库账房",
        description: "查看藩库公式、跨辖区流水和储蓄记录。",
        visualAnchor: "石券库廊、铁包库门、区域分柜和转运车册。",
      },
      council: {
        ...roomConfigs.council,
        name: "督府议政厅",
        description: "查看七天奏报、辖地复盘和处理选择。",
        visualAnchor: "区域沙盘、环形幕僚席、驿路线图和令箭架。",
      },
      works: {
        ...roomConfigs.works,
        name: "营造署",
        description: "查看储蓄目标和区域工程建设进度。",
        visualAnchor: "河道／道路沙盘、测量架、工程卷架和大型工棚。",
      },
    },
  },
  {
    key: "regent",
    theme: "regent",
    index: 3,
    displayName: "监国",
    maleName: "监国",
    femaleName: "监国",
    aliases: ["监国", "摄政"],
    residenceName: "王府",
    treasuryName: "内库",
    emergencyName: "监国急奏",
    buildingScale: "宫城外朝级王府，拥有三重轴线、政事堂、内库和将作监。",
    architecture: "深紫、黛黑与暗金，高台、重檐和长廊使用宫廷级构件但不设御座。",
    attire: "紫黑礼服配暗金边、宽玉带、监国冠饰，持玉笏或监国印匣。",
    poses: {
      stable: "半立于中央政务案前，抬手召集群臣，不占用御座。",
      strained: "坐于长案前逐项批阅缩减清单，身边侍从减少。",
      deficit: "站立封存非必要仪仗，亲自签署修缮先后令。",
    },
    sceneAsset: "/world-regent-rooms.jpg",
    portraitAssets: createPortraitAssets("regent"),
    rooms: {
      hall: {
        ...roomConfigs.hall,
        name: "王府中枢堂",
        description: "查看中枢财政、内库账面和风险的主页总览。",
        visualAnchor: "三重门轴、中央政务案、监国印匣和无御座高屏。",
      },
      treasury: {
        ...roomConfigs.treasury,
        name: "内库账房",
        description: "查看内库公式、全国性流水和储蓄记录。",
        visualAnchor: "重檐库门、贡物名册柜、分署账案和四重封签。",
      },
      council: {
        ...roomConfigs.council,
        name: "政事堂",
        description: "查看七天奏报、中枢复盘和处理选择。",
        visualAnchor: "天下舆图、八席大案、奏匣墙和时序漏刻。",
      },
      works: {
        ...roomConfigs.works,
        name: "将作监",
        description: "查看储蓄目标、重大建设进度和空间解锁。",
        visualAnchor: "城防／水利模型、匠作样册、尺度台和材料总署。",
      },
    },
  },
  {
    key: "emperor",
    theme: "emperor",
    index: 4,
    displayName: "皇帝／女帝",
    maleName: "皇帝",
    femaleName: "女帝",
    aliases: ["皇帝", "女帝", "皇帝／女帝", "皇帝 / 女帝", "帝王", "君主"],
    residenceName: "宫城",
    treasuryName: "国库",
    emergencyName: "御前急奏",
    buildingScale: "完整宫城，拥有多重宫门、正朝大殿、国库总署、议政殿和将作院。",
    architecture: "宏大中轴、宫墙和重檐殿宇，以玄色、赤金和宫墙红建立终阶尺度。",
    attire: "玄色或赤金帝王礼服；皇帝与女帝只在体态、发冠和衣领细节上区分。",
    poses: {
      stable: "在御案前审阅奏册，以开放手势调度百官与工匠。",
      strained: "离开高座俯身查看国库与工程图，神情专注。",
      deficit: "立于清空后的御案旁签署裁撤与修复令，保持掌控感。",
    },
    sceneAsset: "/world-emperor-rooms.jpg",
    portraitAssets: createPortraitAssets("emperor"),
    rooms: {
      hall: {
        ...roomConfigs.hall,
        name: "正朝大殿",
        description: "查看国库与天下财政、最高风险的主页总览。",
        visualAnchor: "宫门远景、重檐大殿、御案和高阶百官列位。",
      },
      treasury: {
        ...roomConfigs.treasury,
        name: "国库总署",
        description: "查看国库公式、全局流水和储蓄记录。",
        visualAnchor: "宫墙内库门、分库印柜、封册台和护库仪仗。",
      },
      council: {
        ...roomConfigs.council,
        name: "议政殿",
        description: "查看七天奏报、御前议政和处理选择。",
        visualAnchor: "巨幅天下舆图、御前长案、群臣席和奏章轨道。",
      },
      works: {
        ...roomConfigs.works,
        name: "将作院",
        description: "查看储蓄目标、终阶建设和装饰解锁。",
        visualAnchor: "宫城总模型、山河工程图、百工样架和总工台。",
      },
    },
  },
] as const;

const rankConfigByKey = Object.fromEntries(
  rankConfigs.map((config) => [config.key, config]),
) as Record<RankKey, RankConfig>;

const normalizeRankText = (rank: string) =>
  rank
    .trim()
    .replaceAll(" ", "")
    .replaceAll("/", "／")
    .replace(/^现任/, "")
    .replace(/^当前官阶[:：]?/, "");

const normalizedRankAliases = new Map<string, RankKey>(
  rankConfigs.flatMap((config) => [
    [normalizeRankText(config.key), config.key] as const,
    [normalizeRankText(config.displayName), config.key] as const,
    ...config.aliases.map(
      (alias) => [normalizeRankText(alias), config.key] as const,
    ),
  ]),
);

/**
 * Normalizes both current Chinese rank labels and internal rank keys.
 * Unknown values fall back to county so an old or incomplete local profile
 * can still render a valid world.
 */
export function normalizeRank(
  rank: string | RankKey,
  fallback: RankKey = "county",
): RankKey {
  const normalized = normalizeRankText(rank);
  return normalizedRankAliases.get(normalized) ?? fallback;
}

export function getRankConfig(rank: string | RankKey): RankConfig {
  return rankConfigByKey[normalizeRank(rank)];
}

export function getRankIndex(rank: string | RankKey): number {
  return getRankConfig(rank).index;
}

export function getNextRank(rank: string | RankKey): RankConfig | null {
  return rankConfigs[getRankIndex(rank) + 1] ?? null;
}

export function getRankDisplayName(
  rank: string | RankKey,
  gender?: CharacterGender,
): string {
  const config = getRankConfig(rank);
  if (!gender) return config.displayName;
  return gender === "female" ? config.femaleName : config.maleName;
}

export function getRankPortraitAsset(
  rank: string | RankKey,
  gender: CharacterGender,
  fiscalState: FiscalStateKey = "stable",
): { src: string; fiscalState: FiscalStateKey } {
  const config = getRankConfig(rank);
  return {
    src: config.portraitAssets[gender][fiscalState],
    fiscalState,
  };
}

export function getRoomConfig(
  rank: string | RankKey,
  room: RoomKey,
): RoomConfig {
  return getRankConfig(rank).rooms[room];
}

export function getRoomName(
  rank: string | RankKey,
  room: RoomKey,
): string {
  return getRoomConfig(rank, room).name;
}

export function getRoomDescription(
  rank: string | RankKey,
  room: RoomKey,
): string {
  return getRoomConfig(rank, room).description;
}

/**
 * Returns the rank-level room sprite sheet. The same sheet contains all four
 * rooms and all three persistent fiscal states.
 */
export function getSceneAsset(rank: string | RankKey): string {
  return getRankConfig(rank).sceneAsset;
}

const roomRow: Record<RoomKey, number> = {
  hall: 0,
  treasury: 1,
  council: 2,
  works: 3,
};

const fiscalColumn: Record<FiscalStateKey, number> = {
  stable: 0,
  strained: 1,
  deficit: 2,
};

/**
 * Sprite contract: three fiscal-state columns by four room rows.
 */
export function getSceneSprite(
  rank: string | RankKey,
  room: RoomKey,
  fiscalState: FiscalStateKey,
): SceneSprite {
  const rankKey = normalizeRank(rank);
  const column = fiscalColumn[fiscalState];
  const row = roomRow[room];

  return {
    id: `${rankKey}.${room}.${fiscalState}`,
    src: getSceneAsset(rankKey),
    fiscalColumn: column,
    roomRow: row,
    backgroundSize: "300% 400%",
    backgroundPosition: `${(column / 2) * 100}% ${(row / 3) * 100}%`,
  };
}

export function getFiscalStateCopy(
  rank: string | RankKey,
  fiscalState: FiscalStateKey,
  room: RoomKey = "hall",
): FiscalStateCopy {
  const config = getRankConfig(rank);
  const roomConfig = config.rooms[room];

  if (fiscalState === "deficit") {
    return {
      label: `${config.treasuryName}告急`,
      title: `${roomConfig.name}进入亏空状态`,
      description:
        room === "hall"
          ? `${config.residenceName}屋瓦门窗出现破损，陈设大量撤空，庭院枯败且只保留必要值守。`
          : room === "treasury"
            ? `${roomConfig.name}只保留核心账册与必要设施，空架、封存区和少量值守人员清晰可见。`
            : room === "council"
              ? `${roomConfig.name}缩减到核心席位，撤项与修复次序成为当前议事重点。`
              : `${roomConfig.name}施工停摆，可移动工具和材料撤走，未完成区域进入封存。`,
    };
  }

  if (fiscalState === "strained") {
    return {
      label: "财政吃紧",
      title: `${roomConfig.name}开始收缩`,
      description:
        room === "hall"
          ? `${config.residenceName}主体仍完整，但附属空间关闭，部分陈设、灯火和人气减少。`
          : room === "treasury"
            ? `${roomConfig.name}出现空架与封存分区，人员和搬运批次缩减。`
            : room === "council"
              ? `${roomConfig.name}保留核心地图与席位，侍从减少，议题集中到压缩开支。`
              : `${roomConfig.name}保留当前建设成果，但工程封存、材料盖布，只留少量看守。`,
    };
  }

  return {
    label: "财政丰盈",
    title: `${roomConfig.name}运转充足`,
    description:
      room === "hall"
        ? `${config.residenceName}建筑完整、陈设丰足、花木繁盛，人员与施工有序运转。`
        : room === "treasury"
          ? `${roomConfig.name}账架、箱柜和封册齐全，库吏与搬运人员正常工作。`
          : room === "council"
            ? `${roomConfig.name}地图、席位与卷宗完整，角色和书记有序议事。`
            : `${roomConfig.name}工匠、材料、图纸与模型齐全，建设按计划推进。`,
  };
}
