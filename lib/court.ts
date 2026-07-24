export type CourtVocabulary = {
  treasury: string;
  residence: string;
  emergency: string;
  realm: string;
};

export const getCourtVocabulary = (rank: string): CourtVocabulary => {
  if (rank === "皇帝" || rank === "女帝") {
    return {
      treasury: "国库",
      residence: "宫城",
      emergency: "御前急奏",
      realm: "宫中",
    };
  }

  if (rank === "巡抚") {
    return {
      treasury: "藩库",
      residence: "行辕",
      emergency: "督署急奏",
      realm: "行辕中",
    };
  }

  if (rank === "知府") {
    return {
      treasury: "府库",
      residence: "府衙",
      emergency: "州府急奏",
      realm: "府中",
    };
  }

  if (rank === "从九品县令") {
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
