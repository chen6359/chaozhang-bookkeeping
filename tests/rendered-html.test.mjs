import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import {
  calculateFinance,
  calculateRecoverySavings,
} from "../lib/finance.ts";
import {
  getDemoGuideStep,
  shouldCompleteDemoRecovery,
} from "../lib/guide.ts";
import {
  calculateUncategorizedExpenseTotal,
  inferLedgerClassification,
  inferLedgerQuestionIntent,
} from "../lib/ledger.ts";
import {
  getCourtAddress,
  getCourtVocabulary,
} from "../lib/court.ts";
import {
  getCouncilAvailability,
  getCouncilPeriodKey,
} from "../lib/council.ts";
import {
  MAX_NEXT_CYCLE_REFERENCE,
  parseNextCycleReferenceAmount,
} from "../lib/reference.ts";
import {
  getFiscalStateCopy,
  getRankDisplayName,
  getRankPortraitAsset,
  getRoomConfig,
  getSceneSprite,
  rankConfigs,
  rankKeys,
  roomKeys,
} from "../lib/world.ts";
import {
  getNpcAssetPath,
  getNpcPortraitAsset,
  npcCharacterFamilies,
  npcRankCharacterProfiles,
  npcAssetMoods,
  npcAssetRoutes,
} from "../lib/characters.ts";
import {
  countySceneMediaAssets,
  getSceneMediaAsset,
} from "../lib/scene-media.ts";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Chaozhang prototype entry", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>朝账｜让每一笔收支改变眼前的世界<\/title>/i);
  assert.match(html, /从一座小县衙开始/);
  assert.match(html, /进入我的账本/);
  assert.match(html, /体验完整演示/);
  assert.match(html, /不连接银行卡，也不会保管或划转真实资金/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("real and demo modes keep independent entry and persistence paths", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(source, /type Mode = "real" \| "demo";/);
  assert.match(source, /const realStorageKey = "chaozhang-real-v2";/);
  assert.match(source, /const demoStorageKey = "chaozhang-demo-v3";/);
  assert.match(
    source,
    /onClick=\{\(\) => onChoose\("real"\)\} data-testid="choose-real"/,
  );
  assert.match(
    source,
    /onClick=\{\(\) => onChoose\("demo"\)\} data-testid="choose-demo"/,
  );
  assert.match(
    source,
    /if \(selected === "demo"\)[\s\S]*?createDemoState\(\)[\s\S]*?else[\s\S]*?createBlankRealState\(\)/,
    "the two mode choices should hydrate different initial states",
  );
  assert.match(
    source,
    /if \(mode === "real" && !state\.profile\.onboarded\)[\s\S]*?<Onboarding/,
    "real mode should complete onboarding before entering the ledger",
  );
  assert.match(
    source,
    /onResetDemo=\{\(\) => \{[\s\S]*?createDemoState\(\)[\s\S]*?demoStorageKey/,
    "demo mode should expose a deterministic reset path",
  );
});

test("all four primary destinations have desktop, mobile, content, and room routes", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const tabs = [
    ["home", "renderHome"],
    ["treasury", "renderTreasury"],
    ["council", "renderCouncil"],
    ["build", "renderBuild"],
  ];

  assert.match(source, /type TabKey = "home" \| "treasury" \| "council" \| "build";/);
  for (const [key, renderer] of tabs) {
    assert.match(source, new RegExp(`\\{ key: "${key}", label:`));
    assert.match(source, new RegExp(`tab === "${key}" && ${renderer}\\(\\)`));
  }
  assert.match(
    source,
    /data-testid=\{`nav-\$\{item\.key\}`\}/,
    "desktop navigation should expose a stable route selector",
  );
  assert.match(
    source,
    /<nav className="mobile-nav"[\s\S]*?tabItems\.slice\(0,\s*2\)[\s\S]*?tabItems\.slice\(2\)/,
    "mobile navigation should be generated from the same four-route contract",
  );
  assert.match(source, /onClick=\{\(\) => setTab\("home"\)\}>进入大堂/);
  assert.match(source, /onClick=\{\(\) => setTab\("treasury"\)\}>查看库房/);
  assert.match(source, /onClick=\{\(\) => setTab\("council"\)\}>前往议事厅/);
  assert.match(
    source,
    /onClick=\{\(\) => openWorldPreview\(stage\.key, "works", fiscalState\)\}>查看营造院/,
  );
});

test("every JSX button is wired to an action instead of being a visual placeholder", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const sourceFile = ts.createSourceFile(
    "page.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const missingActions = [];
  let buttonCount = 0;

  const inspect = (node) => {
    if (
      (ts.isJsxElement(node) && node.openingElement.tagName.getText(sourceFile) === "button") ||
      (ts.isJsxSelfClosingElement(node) && node.tagName.getText(sourceFile) === "button")
    ) {
      buttonCount += 1;
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const attributes = opening.attributes.properties
        .filter(ts.isJsxAttribute)
        .map((attribute) => attribute.name.getText(sourceFile));
      if (!attributes.includes("onClick") && !attributes.includes("type")) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(opening.getStart(sourceFile));
        missingActions.push(line + 1);
      }
    }
    ts.forEachChild(node, inspect);
  };
  inspect(sourceFile);

  assert.ok(buttonCount >= 50, `expected the complete interactive surface, found ${buttonCount} buttons`);
  assert.deepEqual(
    missingActions,
    [],
    `button elements without an action were found on lines ${missingActions.join(", ")}`,
  );
});

test("entry and onboarding screens remove the desktop offset on phone widths", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const marker = "/* Mobile entry and onboarding composition */";
  const markerIndex = styles.indexOf(marker);

  assert.notEqual(markerIndex, -1, "mobile entry overrides should remain at the end of the stylesheet");

  const mobileStyles = styles.slice(markerIndex);
  assert.match(
    mobileStyles,
    /@media \(max-width: 820px\)[\s\S]*?\.entry-card,[\s\S]*?\.wizard-card\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*680px;[^}]*margin:\s*0 auto;/,
    "narrow screens must override the high-fidelity desktop card offset",
  );
  assert.match(
    mobileStyles,
    /@media \(max-width: 640px\)[\s\S]*?\.entry-card,[\s\S]*?\.wizard-card\s*\{[^}]*max-width:\s*none;[\s\S]*?\.mode-card\s*\{[^}]*grid-template-columns:\s*42px minmax\(0,\s*1fr\);[^}]*min-width:\s*0;[^}]*min-height:\s*0;/,
    "phone mode choices should use a compact single-column composition",
  );
  assert.match(
    mobileStyles,
    /\.entry-screen,[\s\S]*?\.onboarding\s*\{[^}]*min-height:\s*100dvh;[^}]*overflow-x:\s*clip;/,
  );
});

test("customer UI does not expose internal prototype annotations", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const forbiddenCopy = [
    "低保真交互原型",
    "正式PRD",
    "原型占位",
    "三臣同屏急奏",
    "角色只负责演绎和解释",
    "太监负责把事情喊出来",
    "程序事实",
    "MVP第三阶段",
    "尚未开放",
    "可修改、可删除",
  ];

  for (const copy of forbiddenCopy) {
    assert.doesNotMatch(source, new RegExp(copy), `internal copy leaked: ${copy}`);
  }

  assert.doesNotMatch(
    source,
    /<small>\{role\.tone\}<\/small>/,
    "internal role-tone metadata should not be rendered to customers",
  );
  assert.doesNotMatch(source, /之后仍可修改|每满7天送达一次|问AI账房/);
});

test("next-cycle category references are real persisted drafts", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(source, /nextCycleReferences:\s*Partial<Record<BudgetKey,\s*NextCycleReference>>/);
  assert.match(source, /candidate\.nextCycleReferences \?\? \{\}/);
  assert.match(source, /data-testid="open-risk-reference-editor"/);
  assert.match(source, /data-testid="open-council-reference-editor"/);
  assert.match(source, /data-testid="next-cycle-reference-editor"/);
  assert.match(source, /data-testid="save-next-cycle-reference"/);
  assert.match(source, /data-testid="delete-next-cycle-reference"/);
  assert.match(source, /仅保存为下周期草案，不改变本期额度、风险或/);
  assert.match(
    source,
    /normalizeExpenseCategory\(item\.category\) === "其他"[\s\S]*?setTab\("treasury"\);[\s\S]*?editItem\(firstUnclassified\);/,
    "uncategorized spending should open the real ledger editor",
  );
  assert.doesNotMatch(
    source,
    /saveRiskDecision\(`设置下周期\$\{leadingCategory\.key\}参考额度`\)/,
    "the risk action must open a real editor instead of saving a sentence",
  );
});

test("next-cycle reference amounts accept only positive bounded whole yuan", () => {
  assert.equal(parseNextCycleReferenceAmount("1,200"), 1_200);
  assert.equal(
    parseNextCycleReferenceAmount(String(MAX_NEXT_CYCLE_REFERENCE)),
    MAX_NEXT_CYCLE_REFERENCE,
  );
  assert.equal(parseNextCycleReferenceAmount("0"), null);
  assert.equal(parseNextCycleReferenceAmount("-10"), null);
  assert.equal(parseNextCycleReferenceAmount("99.5"), null);
  assert.equal(parseNextCycleReferenceAmount("一千"), null);
  assert.equal(parseNextCycleReferenceAmount(String(MAX_NEXT_CYCLE_REFERENCE + 1)), null);
});

test("risk page renders actual role cards instead of a role-design explanation", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /data-testid="risk-cast"/);
  assert.match(source, /data-testid="risk-role-card"/);
  assert.match(source, /currentRiskCast\.map/);
  assert.match(source, /钱粮小吏/);
  assert.match(source, /advisor: "师爷"/);
  assert.match(source, /rankKey === "emperor"[\s\S]*?comic: "御前太监"[\s\S]*?advisor: "户部尚书"/);
  assert.match(source, /companion: partnerIsMale \? "皇夫" : "皇后"/);
  assert.doesNotMatch(source, /<NpcStage cast=\{currentRiskCast\}/);
  assert.match(
    source,
    /className="risk-role-identity"[\s\S]*?<NpcPortrait[\s\S]*?role\.name[\s\S]*?className="risk-role-dialogue"[\s\S]*?role\.line/,
    "each role portrait and its dialogue should live in the same role card",
  );
  assert.match(
    styles.slice(styles.indexOf("/* Character presentation V3")),
    /\.risk-role-identity\s*\{[^}]*background:\s*transparent;[\s\S]*?\.risk-role-dialogue\s*\{[^}]*border:\s*1px solid/s,
    "the character should be unframed while its own dialogue remains readable",
  );
  assert.match(styles, /\.risk-modal \.decision-list,[\s\S]*?position:\s*static;/);
  assert.match(
    styles,
    /@media \(max-width: 640px\)[\s\S]*?\.risk-modal\s*\{[^}]*display:\s*block;[\s\S]*?\.risk-cast\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[\s\S]*?\.risk-modal \.decision-list,[\s\S]*?position:\s*relative;[^}]*inset:\s*auto;/,
    "mobile risk content and its actions should remain in normal flow",
  );
});

test("all five ranks use standalone protagonist assets for every fiscal state", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const sceneAssets = rankConfigs.map((rank) => rank.sceneAsset.slice(1));
  const fiscalStates = ["stable", "strained", "deficit"];
  const genders = ["male", "female"];
  const portraitAssets = rankConfigs.flatMap((rank) =>
    genders.flatMap((gender) =>
      fiscalStates.map((fiscalState) =>
        getRankPortraitAsset(rank.key, gender, fiscalState).src.slice(1),
      ),
    ),
  );

  assert.deepEqual(rankKeys, [
    "county",
    "prefecture",
    "governor",
    "regent",
    "emperor",
  ]);
  assert.equal(rankConfigs.length, 5);
  assert.equal(portraitAssets.length, 30);
  assert.equal(new Set(portraitAssets).size, 30);
  for (const assetName of sceneAssets) {
    const asset = await readFile(new URL(`../public/${assetName}`, import.meta.url));
    assert.ok(asset.byteLength > 400_000, `${assetName} should be a full room-scene asset`);
  }
  for (const assetName of portraitAssets) {
    const asset = await readFile(new URL(`../public/${assetName}`, import.meta.url));
    assert.ok(asset.byteLength > 8_000, `${assetName} should be a real standalone portrait`);
    assert.doesNotMatch(assetName, /sheet|sprite|ranks-/);
  }
  for (const rank of rankKeys) {
    for (const gender of genders) {
      const hashes = [];
      for (const fiscalState of fiscalStates) {
        const assetName = getRankPortraitAsset(rank, gender, fiscalState).src.slice(1);
        const asset = await readFile(new URL(`../public/${assetName}`, import.meta.url));
        hashes.push(createHash("sha256").update(asset).digest("hex"));
      }
      assert.equal(
        new Set(hashes).size,
        3,
        `${gender}/${rank} must visibly change across all three fiscal states`,
      );
    }
  }
  assert.match(source, /function RankPortrait\(/);
  assert.match(source, /const portrait = getRankPortraitAsset\(rank, gender, fiscalState\);/);
  assert.match(source, /<img src=\{portrait\.src\} alt="" draggable=\{false\} \/>/);
  assert.match(
    source,
    /data-fiscal-state=\{portrait\.fiscalState\}/,
  );
  assert.doesNotMatch(source, /ranks-(?:male|female)\.jpg|portrait\.index/);
});

test("fiscal-state portraits are wired through every protagonist surface", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(
    source,
    /rank=\{state\.profile\.rank\}[\s\S]*?presentation=\{state\.profile\.presentation\}[\s\S]*?fiscalState=\{fiscalState\}[\s\S]*?label=\{`\$\{state\.profile\.name\}的/,
  );
  assert.match(
    source,
    /rank=\{stage\.key\}[\s\S]*?presentation=\{state\.profile\.presentation\}[\s\S]*?fiscalState=\{visualState\}/,
  );
  assert.match(
    source,
    /rank=\{previewRank\}[\s\S]*?presentation=\{state\.profile\.presentation\}[\s\S]*?fiscalState=\{previewFiscalState\}/,
  );
  assert.match(
    source,
    /compact[\s\S]*?rank=\{state\.profile\.rank\}[\s\S]*?presentation=\{state\.profile\.presentation\}[\s\S]*?fiscalState=\{fiscalState\}/,
  );
});

test("promotion is a real edict and never reuses a character portrait", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const start = source.indexOf("{promotionOpen && (");
  const end = source.indexOf("{settingsOpen && (", start);
  const promotion = source.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(promotion, /<PromotionEdict/);
  assert.match(source, /data-testid="promotion-edict"/);
  assert.match(source, />制曰</);
  assert.match(source, /授\{rankName\}，移治\{rankConfig\.residenceName\}/);
  assert.match(source, /className="edict-seal"/);
  assert.doesNotMatch(promotion, /<RankPortrait|<NpcPortrait/);
});

test("five ranks expose four rooms across all three persistent fiscal states", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const fiscalStates = ["stable", "strained", "deficit"];
  const spriteIds = new Set();

  assert.deepEqual(roomKeys, ["hall", "treasury", "council", "works"]);
  for (const rank of rankConfigs) {
    const roomNames = new Set();
    for (const room of roomKeys) {
      const config = getRoomConfig(rank.key, room);
      assert.equal(config.key, room);
      assert.ok(config.name.length >= 3);
      assert.ok(config.navigationLabel.length >= 4);
      roomNames.add(config.name);
      for (const fiscalState of fiscalStates) {
        const sprite = getSceneSprite(rank.key, room, fiscalState);
        assert.equal(sprite.src, rank.sceneAsset);
        assert.equal(sprite.backgroundSize, "300% 400%");
        assert.ok(!spriteIds.has(sprite.id), `${sprite.id} should be unique`);
        spriteIds.add(sprite.id);
      }
    }
    assert.equal(roomNames.size, 4, `${rank.key} should have four distinct rooms`);
  }
  assert.equal(spriteIds.size, 5 * 4 * 3);
  assert.match(source, /const sceneMedia = getSceneMediaAsset\(rank, room, fiscalState\);/);
  assert.match(source, /data-room=\{room\}/);
  assert.match(source, /data-rank=\{rankConfig\.key\}/);
  assert.match(source, /data-fiscal-state=\{fiscalState\}/);
  assert.match(source, /<SceneMedia[\s\S]*?media=\{sceneMedia\}/);
});

test("county scenes have 12 real posters and reviewed motion sources", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const component = await readFile(
    new URL("../components/SceneMedia.tsx", import.meta.url),
    "utf8",
  );
  const entries = Object.values(countySceneMediaAssets);

  assert.equal(entries.length, 4 * 3);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 12);
  assert.equal(new Set(entries.map((entry) => entry.poster)).size, 12);
  assert.equal(new Set(entries.map((entry) => entry.webm)).size, 12);
  assert.equal(new Set(entries.map((entry) => entry.mp4)).size, 12);
  for (const entry of entries) {
    assert.match(entry.webm ?? "", /\.webm$/);
    assert.match(entry.mp4 ?? "", /\.mp4$/);
    await access(new URL(`../public${entry.poster}`, import.meta.url));
    await access(new URL(`../public${entry.webm}`, import.meta.url));
    await access(new URL(`../public${entry.mp4}`, import.meta.url));
  }

  const county = getSceneMediaAsset("county", "hall", "stable");
  assert.equal(county.poster, "/scenes/county/hall/stable/poster.webp");
  assert.equal(county.posterBackgroundSize, undefined);

  const prefectureFallback = getSceneMediaAsset(
    "prefecture",
    "hall",
    "stable",
  );
  assert.equal(prefectureFallback.poster, "/world-prefecture-rooms.jpg");
  assert.equal(prefectureFallback.posterBackgroundSize, "300% 400%");

  assert.match(source, /import \{ SceneMedia \} from "\.\.\/components\/SceneMedia"/);
  assert.match(component, /muted[\s\S]*?loop[\s\S]*?playsInline/);
  assert.match(component, /preload="metadata"/);
  assert.match(component, /poster=\{media\.poster\}/);
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.match(component, /new IntersectionObserver/);
  assert.match(component, /rootMargin: "320px 0px"/);
  assert.match(component, /video\.pause\(\)/);
  assert.match(component, /loading=\{eagerPoster \? "eager" : "lazy"\}/);
});

test("build page combines rank characters, offices, and real room navigation", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(source, />仕途与官署图鉴</);
  assert.match(source, /\{rankConfigs\.map\(\(stage, index\) => \{/);
  assert.match(source, /className=\{`rank-world-card \$\{relation\}`\}/);
  assert.match(source, /<RankPortrait[\s\S]*?rank=\{stage\.key\}/);
  assert.match(source, /getSceneMediaAsset\(stage\.key, "hall", visualState\)/);
  assert.match(source, /className="rank-room-nav"/);
  assert.match(source, /onClick=\{\(\) => setTab\("home"\)\}>进入大堂/);
  assert.match(source, /onClick=\{\(\) => setTab\("treasury"\)\}>查看库房/);
  assert.match(source, /onClick=\{\(\) => setTab\("council"\)\}>前往议事厅/);
  assert.match(source, /openWorldPreview\(stage\.key, "works", fiscalState\)/);
  assert.match(source, /data-testid=\{`preview-rank-\$\{stage\.key\}`\}/);
  assert.match(source, /data-testid=\{`world-rank-\$\{rank\.key\}`\}/);
  assert.match(source, /data-testid=\{`world-room-\$\{room\}`\}/);
  assert.match(source, /data-testid=\{`world-fiscal-\$\{value\}`\}/);
  assert.match(source, /rank=\{previewRank\}[\s\S]*?room=\{previewRoom\}[\s\S]*?fiscalState=\{previewFiscalState\}/);
  assert.doesNotMatch(source, />场景库<|>官阶录<|className="scene-library"/);
});

test("rank world CSS uses unframed cutouts and a phone-safe single-column preview", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const characterStyles = styles.slice(styles.indexOf("/* Character presentation V3"));

  assert.match(
    characterStyles,
    /\.rank-portrait,[\s\S]*?\.npc-portrait\s*\{[^}]*overflow:\s*visible;[^}]*border:\s*0;[^}]*background-color:\s*transparent;[^}]*background-image:\s*none !important;[^}]*box-shadow:\s*none;/s,
  );
  assert.match(
    characterStyles,
    /\.rank-portrait > img,[\s\S]*?\.npc-portrait > img\s*\{[^}]*object-fit:\s*contain;[^}]*object-position:\s*center bottom;/s,
  );
  assert.match(
    styles,
    /\.world-scene-art\s*\{[^}]*background-repeat:\s*no-repeat;[^}]*transform:\s*none;/s,
  );
  assert.match(
    styles,
    /\.world-preview-stage\s*\{[^}]*grid-template-columns:\s*minmax\(210px,\s*0\.32fr\) minmax\(0,\s*1fr\);/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 900px\)\s*\{[\s\S]*?\.rank-world-grid\s*\{[^}]*grid-template-columns:\s*1fr;/,
    "rank and office cards should become a single column on narrow screens",
  );
  assert.match(
    styles,
    /@media \(max-width: 640px\)\s*\{[\s\S]*?\.world-preview-stage\s*\{[^}]*grid-template-columns:\s*1fr;/,
    "the character and room preview should stack on phone widths",
  );
});

test("rank-aware NPCs use standalone role, rank, and event-mood assets", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const characterStyles = styles.slice(styles.indexOf("/* Character presentation V3"));
  const assets = rankKeys.flatMap((rank) =>
    npcAssetRoutes.flatMap((route) =>
      npcAssetMoods.map((mood) => getNpcAssetPath(route, rank, mood).slice(1)),
    ),
  );

  assert.match(source, /type NpcMood\s*=/);
  assert.match(source, /data-mood=\{mood\}/);
  assert.match(source, /data-rank=\{asset\.rankKey\}/);
  assert.match(source, /data-character-id=\{asset\.characterId\}/);
  assert.match(source, /data-character-family=\{asset\.route\}/);
  assert.match(source, /data-role-kind=\{role\.kind\}/);
  assert.match(source, /data-role-name=\{role\.name\}/);
  assert.match(source, /riskLevel === "deficit" \? "alarm" : "warning"/);
  assert.match(source, /mood=\{role\.mood\}/);
  assert.match(source, /mood="council"/);
  assert.match(source, /didRecover \|\| recoveryCompleted \? "recovery" : "success"/);
  assert.match(source, /const asset = getNpcPortraitAsset\(/);
  assert.match(source, /<img src=\{asset\.src\} alt="" draggable=\{false\} \/>/);
  assert.doesNotMatch(source, /npc-(?:comic|advisor|companion-[^"]+)-ranks\.jpg|500% 300%/);
  assert.match(source, /className="feedback-role-identity"/);
  assert.match(source, /className="feedback-role-dialogue"/);
  assert.match(
    characterStyles,
    /\.risk-role-identity > \.npc-portrait\s*\{[^}]*overflow:\s*visible;[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
  );
  assert.match(
    characterStyles,
    /\.feedback-role-identity > \.npc-portrait\s*\{[^}]*overflow:\s*visible;[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
  );

  assert.equal(assets.length, 60);
  assert.equal(new Set(assets).size, 60);
  for (const assetName of assets) {
    const asset = await readFile(new URL(`../public/${assetName}`, import.meta.url));
    assert.ok(asset.byteLength > 5_000, `${assetName} should be a real standalone NPC`);
    assert.doesNotMatch(assetName, /sheet|sprite|ranks-/);
  }
});

test("rank-specific messengers and advisors cannot silently fall back to collage crops", async () => {
  const script = await readFile(
    new URL("../scripts/extract-character-assets.py", import.meta.url),
    "utf8",
  );
  assert.match(script, /ROOT\s*\/\s*"design-assets"\s*\/\s*"characters"/);
  assert.match(script, /if route in \{"comic", "advisor"\}:/);
  assert.match(script, /raise FileNotFoundError\(/);

  for (const route of ["comic", "advisor"]) {
    for (const rank of rankKeys) {
      for (const mood of npcAssetMoods) {
        await access(
          new URL(
            `../design-assets/characters/npc-individual/${route}/${rank}/${mood}.webp`,
            import.meta.url,
          ),
        );
      }
    }
  }
});

test("three-person warnings resolve to three explicit character families", async () => {
  assert.deepEqual(
    Object.keys(npcCharacterFamilies),
    ["comic", "advisor", "companion-female", "companion-male"],
  );

  for (const rank of rankKeys) {
    for (const presentation of ["男性", "女性"]) {
      const cast = [
        getNpcPortraitAsset("comic", rank, presentation, "warning"),
        getNpcPortraitAsset("advisor", rank, presentation, "warning"),
        getNpcPortraitAsset("companion", rank, presentation, "warning"),
      ];
      assert.equal(new Set(cast.map((role) => role.route)).size, 3);
      assert.equal(new Set(cast.map((role) => role.characterId)).size, 3);
      assert.equal(new Set(cast.map((role) => role.src)).size, 3);
      assert.equal(new Set(cast.map((role) => role.identity)).size, 3);
    }
  }
  assert.equal(
    new Set(
      rankKeys.flatMap((rank) => [
        npcRankCharacterProfiles[rank].comic.id,
        npcRankCharacterProfiles[rank].advisor.id,
      ]),
    ).size,
    10,
    "messengers and advisors must be ten rank-specific people, not two people changing costume",
  );
  assert.equal(
    new Set(
      rankKeys.flatMap((rank) => [
        npcRankCharacterProfiles[rank].comic.identity,
        npcRankCharacterProfiles[rank].advisor.identity,
      ]),
    ).size,
    10,
    "every rank must visibly name its own messenger and advisor",
  );

  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(
    source,
    /riskLevel === "near"[\s\S]*?kind: "comic"[\s\S]*?kind: "advisor"[\s\S]*?: \[[\s\S]*?kind: "comic"[\s\S]*?kind: "advisor"[\s\S]*?kind: "companion"/,
    "overspend and deficit warnings must render comic, advisor, and companion roles",
  );
});

test("open tabs synchronize persisted ledger and treasury changes", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(source, /window\.addEventListener\("storage", syncLedgerAcrossTabs\)/);
  assert.match(source, /event\.storageArea !== window\.localStorage \|\| event\.key !== key/);
  assert.match(source, /hydratePrototypeState\(JSON\.parse\(event\.newValue\) as PrototypeState\)/);
  assert.match(source, /window\.removeEventListener\("storage", syncLedgerAcrossTabs\)/);
});

test("clearing a real ledger requires an explicit destructive confirmation", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(source, /const \[clearBookOpen, setClearBookOpen\] = useState\(false\);/);
  assert.match(
    source,
    /mode === "real" && \([\s\S]*?setSettingsOpen\(false\);[\s\S]*?setClearBookOpen\(true\);[\s\S]*?>\s*清空我的账本/,
    "the settings action should open confirmation instead of deleting immediately",
  );
  assert.match(source, /\{clearBookOpen && \(/);
  assert.match(source, /data-testid="clear-book-confirmation"/);
  assert.match(source, /onClick=\{\(\) => setClearBookOpen\(false\)\}[\s\S]*?>\s*取消/);
  assert.match(source, /data-testid="confirm-clear-book"/);
  assert.match(
    source,
    /data-testid="confirm-clear-book"[\s\S]*?window\.localStorage\.removeItem\(realStorageKey\);[\s\S]*?setClearBookOpen\(false\);[\s\S]*?onExitMode\(\);/,
  );
});

test("fiscal scene uses clear customer copy and cannot leave a stretched white footer", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.doesNotMatch(source, /建设暂停/);
  assert.match(source, /const stateCopy = getFiscalStateCopy\(rank, fiscalState, room\);/);
  for (const rank of rankKeys) {
    for (const room of roomKeys) {
      const stable = getFiscalStateCopy(rank, "stable", room);
      const strained = getFiscalStateCopy(rank, "strained", room);
      const deficit = getFiscalStateCopy(rank, "deficit", room);
      assert.notEqual(stable.description, strained.description);
      assert.notEqual(strained.description, deficit.description);
      assert.match(
        stable.description,
        /完整|丰足|繁盛|充足|充裕|齐全|全数|有序/,
        `${rank}.${room}.stable should visibly communicate abundance`,
      );
      assert.match(
        deficit.description,
        /破损|撤空|枯败|空架|封存|缩减|停摆|撤走|只保留/,
        `${rank}.${room}.deficit should visibly communicate loss`,
      );
    }
  }
  assert.match(styles, /\.scene-card\s*\{[^}]*min-height:\s*0;/s);
  assert.match(
    styles,
    /\.treasury-equation\.deficit\s*\{[^}]*#f8ded9[^}]*#fff5eb\);/s,
    "deficit settlement should use a readable light warning surface",
  );
  assert.match(
    styles,
    /\.treasury-equation\.deficit h2\s*\{[^}]*color:\s*#552824;/s,
  );
  assert.doesNotMatch(
    styles,
    /\.treasury-equation\.deficit\s*\{[^}]*linear-gradient\([^)]*#542825[^)]*#241413/s,
  );
});

test("mobile pages end in a designed dock instead of a large flat remainder", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const presentationV4 = styles.slice(styles.indexOf("/* Presentation V4"));

  assert.match(source, /className=\{`page-foot-ornament page-foot-\$\{tab\}`\}/);
  assert.match(presentationV4, /\.prototype-app\s*\{[^}]*min-height:\s*100dvh;/s);
  assert.match(
    presentationV4,
    /\.main-content\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*calc\(100dvh - var\(--topbar-height\)\);[^}]*flex-direction:\s*column;/s,
  );
  assert.match(
    presentationV4,
    /@media \(max-width:\s*900px\)[\s\S]*?\.app-layout\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s,
  );
  assert.match(
    presentationV4,
    /\.mobile-nav\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);[^}]*border-radius:\s*24px 24px 0 0;/s,
  );
  assert.match(
    presentationV4,
    /\.mobile-add\s*\{[^}]*position:\s*relative;[^}]*justify-self:\s*center;[^}]*transform:\s*translateY\(-6px\);/s,
  );
  assert.match(
    source,
    /tabItems\.slice\(0,\s*2\)[\s\S]*?className="mobile-add"[\s\S]*?tabItems\.slice\(2\)/,
    "the center record action must be third in both visual and keyboard order",
  );
  assert.match(
    presentationV4,
    /padding-bottom:\s*calc\(var\(--bottom-nav-height\) \+ 24px \+ env\(safe-area-inset-bottom\)\)/,
  );
});

test("rank atlas portraits fill their visual column from the shared foot line", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const presentationV4 = styles.slice(styles.indexOf("/* Presentation V4"));

  assert.match(
    presentationV4,
    /\.rank-world-visual > \.rank-portrait,[\s\S]*?height:\s*100%;[^}]*align-self:\s*stretch;/s,
  );
  assert.match(
    presentationV4,
    /\.rank-world-visual > \.rank-portrait > img,[\s\S]*?position:\s*absolute;[^}]*bottom:\s*0;[^}]*left:\s*50%;[^}]*width:\s*auto;[^}]*height:\s*104%;[^}]*max-height:\s*104%;[^}]*transform:\s*translateX\(-50%\);/s,
  );
  assert.match(
    presentationV4,
    /@media \(max-width:\s*640px\)[\s\S]*?grid-template-columns:\s*142px minmax\(0,\s*1fr\);/,
  );
  assert.match(
    presentationV4,
    /@media \(max-width:\s*360px\)[\s\S]*?grid-template-columns:\s*116px minmax\(0,\s*1fr\);/,
  );
});

test("guide action is clickable and dark showcase overlays cannot hide their content", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /data-testid="guide-primary-action"/);
  assert.match(source, /if \(guideStep === 1\) openRecorder\("夜宵118元"\)/);
  assert.match(styles, /\.demo-guide::after\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(styles, /\.demo-guide \.outline-button\.light\s*\{[^}]*pointer-events:\s*auto;/s);
  assert.match(styles, /\.construction-card\s*\{[^}]*rgba\(255, 252, 245, 0\.96\)/s);
});

test("finance rule keeps category warnings separate from total-pool overspend", () => {
  assert.deepEqual(calculateFinance(2_000, 7_900, 8_000), {
    overspend: 0,
    treasuryBalance: 2_000,
    fiscalState: "stable",
  });
});

test("demo overspend makes the virtual treasury negative", () => {
  assert.deepEqual(calculateFinance(5, 2_010, 2_000), {
    overspend: 10,
    treasuryBalance: -5,
    fiscalState: "deficit",
  });
});

test("new savings restores a negative treasury without erasing the overspend fact", () => {
  assert.deepEqual(calculateFinance(105, 2_010, 2_000), {
    overspend: 10,
    treasuryBalance: 95,
    fiscalState: "strained",
  });
});

test("negative treasury can carry forward and recover next period", () => {
  const carriedTreasury = -500;
  const nextPeriodSavings = 2_000;

  assert.deepEqual(calculateFinance(carriedTreasury + nextPeriodSavings, 0, 8_000), {
    overspend: 0,
    treasuryBalance: 1_500,
    fiscalState: "stable",
  });
});

test("night-snack wording is classified as food before entering the ledger", () => {
  assert.deepEqual(inferLedgerClassification("夜宵11800000元"), {
    type: "支出",
    category: "餐饮",
  });
  assert.deepEqual(inferLedgerClassification("宵夜45元"), {
    type: "支出",
    category: "餐饮",
  });
});

test("a savings entry is not mistaken for a savings-progress question", () => {
  const entry = "储蓄100元修缮县衙";

  assert.equal(inferLedgerQuestionIntent(entry), null);
  assert.deepEqual(inferLedgerClassification(entry), {
    type: "储蓄",
    category: "储蓄",
  });
  assert.equal(
    inferLedgerQuestionIntent("我的储蓄进度怎么样？"),
    "savings-progress",
  );
});

test("rank vocabulary keeps all five career stages distinct", () => {
  assert.deepEqual(getCourtVocabulary("从九品县令"), {
    treasury: "县库",
    residence: "县衙",
    emergency: "县署急奏",
    realm: "县中",
  });
  assert.equal(getCourtVocabulary("知府").treasury, "府库");
  assert.equal(getCourtVocabulary("巡抚").treasury, "藩库");
  assert.equal(getCourtVocabulary("监国").treasury, "内库");
  assert.equal(getCourtVocabulary("皇帝").treasury, "国库");
  assert.equal(getRankDisplayName("emperor", "female"), "女帝");
  assert.equal(getRankDisplayName("emperor", "male"), "皇帝");
});

test("NPC honorifics follow rank and speaker instead of reusing 大人", () => {
  assert.equal(getCourtAddress("从九品县令", "comic", "大人"), "大人");
  assert.equal(getCourtAddress("知府", "advisor", "林大人"), "林大人");
  assert.equal(getCourtAddress("巡抚", "companion", "主上"), "主上");
  assert.equal(getCourtAddress("监国", "comic", "大人"), "殿下");
  assert.equal(getCourtAddress("皇帝", "comic", "大人"), "皇上");
  assert.equal(getCourtAddress("皇帝", "advisor", "大人"), "陛下");
  assert.equal(getCourtAddress("女帝", "comic", "大人"), "皇上");
  assert.equal(getCourtAddress("女帝", "advisor", "大人"), "陛下");
});

test("council cadence blocks savings from reopening the same daily or weekly meeting", () => {
  const monday = new Date("2026-07-27T02:00:00.000Z");
  const sameDay = new Date("2026-07-27T10:00:00.000Z");
  const tuesday = new Date("2026-07-28T02:00:00.000Z");
  const nextMonday = new Date("2026-08-03T02:00:00.000Z");

  assert.equal(getCouncilPeriodKey(monday, "daily"), "day:2026-07-27");
  assert.equal(getCouncilPeriodKey(monday, "weekly"), "week:2026-07-27");

  assert.deepEqual(
    getCouncilAvailability({
      cadence: "daily",
      lastCompletedAt: monday.toISOString(),
      ledgerCount: 5,
      lastLedgerCount: 4,
      now: sameDay,
    }).reason,
    "already-held",
  );
  assert.equal(
    getCouncilAvailability({
      cadence: "daily",
      lastCompletedAt: monday.toISOString(),
      ledgerCount: 5,
      lastLedgerCount: 4,
      now: tuesday,
    }).canOpen,
    true,
  );
  assert.equal(
    getCouncilAvailability({
      cadence: "weekly",
      lastCompletedAt: monday.toISOString(),
      ledgerCount: 5,
      lastLedgerCount: 4,
      now: tuesday,
    }).canOpen,
    false,
    "a savings entry in the same week must not reopen council",
  );
  assert.equal(
    getCouncilAvailability({
      cadence: "weekly",
      lastCompletedAt: monday.toISOString(),
      ledgerCount: 5,
      lastLedgerCount: 4,
      now: nextMonday,
    }).canOpen,
    true,
  );
});

test("mobile bookkeeping entry and council cadence controls are explicit and real", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(source, /aria-label="记账：新增一笔收支"/);
  assert.match(source, /className="mobile-add-icon"[\s\S]*?<small>记账<\/small>/);
  assert.match(source, /data-testid=\{`council-cadence-\$\{cadence\}`\}/);
  assert.match(source, /lastCouncilCompletedAt:\s*new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(source, /line:\s*"大人，新进的钱已经记清/);
});

test("unframed NPC cutouts stay paired with readable dialogue at desktop and mobile widths", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const characterStyles = styles.slice(styles.indexOf("/* Character presentation V3"));

  assert.match(
    characterStyles,
    /\.risk-role-card,[\s\S]*?\.risk-role-companion\s*\{[^}]*grid-template-rows:\s*252px minmax\(0,\s*1fr\);[^}]*overflow:\s*visible;[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
  );
  assert.match(
    characterStyles,
    /\.risk-role-identity\s*\{[^}]*height:\s*252px;[^}]*aspect-ratio:\s*auto;/s,
  );
  assert.match(
    characterStyles,
    /\.feedback-role-identity > \.npc-portrait\s*\{[^}]*overflow:\s*visible;[^}]*background:\s*transparent;[\s\S]*?\.risk-role-identity > \.npc-portrait\s*\{[^}]*overflow:\s*visible;[^}]*background:\s*transparent;/s,
  );
  assert.match(
    characterStyles,
    /\.feedback-role-card\s*\{[^}]*grid-template-columns:\s*168px minmax\(0,\s*1fr\);[^}]*overflow:\s*visible;[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
  );
  assert.match(
    characterStyles,
    /@media \(max-width:\s*640px\)[\s\S]*?\.feedback-role-card\s*\{[^}]*grid-template-columns:\s*118px minmax\(0,\s*1fr\);[\s\S]*?\.feedback-role-identity\s*\{[^}]*width:\s*118px;[^}]*height:\s*194px;/s,
  );
});

test("demo recovery amount is large enough to bring the treasury back", () => {
  assert.equal(calculateRecoverySavings(-5), 100);
  assert.equal(calculateRecoverySavings(-3_205), 3_300);
  assert.equal(calculateRecoverySavings(95), 100);
});

test("guide moves from step four to five only after a valid recovery", () => {
  const stepFourSignals = {
    triggerAdded: true,
    councilDecisionMade: true,
    councilDone: true,
    recoveryDone: false,
  };

  assert.equal(getDemoGuideStep(stepFourSignals), 4);
  assert.equal(
    shouldCompleteDemoRecovery(
      4,
      { type: "储蓄", amount: 100 },
      95,
    ),
    true,
  );
  assert.equal(
    shouldCompleteDemoRecovery(
      4,
      { type: "储蓄", amount: 100 },
      -3_105,
    ),
    false,
  );
  assert.equal(
    getDemoGuideStep({ ...stepFourSignals, recoveryDone: true }),
    5,
  );
});

test("unknown expenses still count toward total spending", () => {
  const ledger = [
    { type: "支出", amount: 11_800_000, category: "其他" },
    { type: "收入", amount: 20_000, category: "收入" },
    { type: "储蓄", amount: 2_000, category: "储蓄" },
  ];

  assert.equal(
    calculateUncategorizedExpenseTotal(
      ledger,
      ["餐饮", "住房", "交通", "医疗", "购物", "娱乐"],
    ),
    11_800_000,
  );
});

test("the reported oversized night snack forces a deficit", () => {
  const initialExpense = 1_892;
  const oversizedNightSnack = 11_800_000;

  assert.deepEqual(calculateFinance(5, initialExpense + oversizedNightSnack, 2_000), {
    overspend: 11_799_892,
    treasuryBalance: -11_799_887,
    fiscalState: "deficit",
  });
});
