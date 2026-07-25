export type CourtVocabulary = {
  treasury: string;
  residence: string;
  emergency: string;
  realm: string;
};

type CourtRank = "county" | "prefecture" | "governor" | "regent" | "emperor" | "unknown";

const resolveCourtRank = (rank: string | null | undefined): CourtRank => {
  const normalized = typeof rank === "string"
    ? rank.trim().replace(/\s+/g, "")
    : "";

  if (/皇帝|女帝|帝王|天子|皇上/.test(normalized)) return "emperor";
  if (/监国|摄政王|摄政|亲王/.test(normalized)) return "regent";
  if (/巡抚|总督|督抚/.test(normalized)) return "governor";
  if (/知府|府尹|太守/.test(normalized)) return "prefecture";
  if (/县令|知县|从?九品/.test(normalized)) return "county";
  return "unknown";
};

export const getCourtVocabulary = (
  rank: string | null | undefined,
): CourtVocabulary => {
  const resolvedRank = resolveCourtRank(rank);

  if (resolvedRank === "emperor") {
    return {
      treasury: "国库",
      residence: "宫城",
      emergency: "御前急奏",
      realm: "宫中",
    };
  }

  if (resolvedRank === "regent") {
    return {
      treasury: "内库",
      residence: "王府",
      emergency: "监国急奏",
      realm: "府中",
    };
  }

  if (resolvedRank === "governor") {
    return {
      treasury: "藩库",
      residence: "行辕",
      emergency: "督署急奏",
      realm: "行辕中",
    };
  }

  if (resolvedRank === "prefecture") {
    return {
      treasury: "府库",
      residence: "府衙",
      emergency: "州府急奏",
      realm: "府中",
    };
  }

  if (resolvedRank === "county") {
    return {
      treasury: "县库",
      residence: "县衙",
      emergency: "县署急奏",
      realm: "县中",
    };
  }

  return {
    treasury: "官库",
    residence: "官署",
    emergency: "钱粮急报",
    realm: "署中",
  };
};
