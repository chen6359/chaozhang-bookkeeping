import Link from "next/link";
import { SceneMedia } from "../../components/SceneMedia";
import { getSceneMediaAsset } from "../../lib/scene-media";
import styles from "./page.module.css";

const pageNames = {
  home: "县衙／行辕",
  treasury: "县库／府库",
  council: "议事／朝会",
  build: "建设／营造",
} as const;

const backgroundGroups = [
  {
    id: "A",
    title: "A｜宣纸宫苑长卷",
    description:
      "背景以低对比宣纸暗纹承接所有页面，文字卡片仍是主角；四个导航拥有不同的官署文化纹样。",
  },
  {
    id: "B",
    title: "B｜官署全景延伸（已确认）",
    description:
      "正式采用时只作为虚化、低饱和的气氛层，不模糊任何文字、卡片和按钮。",
  },
] as const;

const councilSteps = [
  {
    id: "01",
    title: "开议",
    speaker: "钱粮小吏",
    line: "大人，本周期账册已经封好，共记了 6 笔。今日是否升堂核账？",
    facts: ["7月22日—7月28日", "每周朝会", "本周期尚未召开"],
    action: "升堂核账",
    backdrop: "/previews/background/B-council.png",
    actors: [
      ["/characters/npc/comic/county/neutral.webp", "钱粮小吏"],
      ["/characters/player/female/county/stable.webp", "县令"],
    ],
  },
  {
    id: "02",
    title: "财政汇报",
    speaker: "师爷",
    line: "本周期共记录支出 ¥2,128，消费池 ¥2,000，当前差额 −¥128；县库账面为 ¥95。",
    facts: ["收入 ¥4,005", "支出 ¥2,128", "预算使用率 106%"],
    action: "查看异常",
    backdrop: "/previews/background/B-council.png",
    actors: [
      ["/characters/npc/advisor/county/neutral.webp", "师爷"],
      ["/characters/npc/comic/county/neutral.webp", "钱粮小吏"],
    ],
  },
  {
    id: "03",
    title: "异常",
    speaker: "钱粮小吏",
    line: "大人！餐饮已经用到 114%，超出原定额度 ¥128 啦！",
    facts: ["餐饮预算 ¥900", "已用 ¥1,028", "前三笔合计 ¥780"],
    action: "召集三人谏言",
    backdrop: "/scenes/county/council/strained/poster.webp",
    actors: [
      ["/characters/npc/comic/county/warning.webp", "钱粮小吏"],
      ["/characters/npc/advisor/county/warning.webp", "师爷"],
    ],
  },
  {
    id: "04",
    title: "三人谏言",
    speaker: "钱粮小吏 · 师爷 · 随行知己",
    line: "三人依次呈报本期餐饮超支",
    lines: [
      "钱粮小吏：“大人！膳房怕是要把下个月的米缸也提前搬空啦！”",
      "师爷：“本期餐饮超支 ¥128，先查三笔最高支出，再决定下周期收紧哪一项。”",
      "随行知己：“现在发现正好，先看清原因，不必一下子把所有享用都砍掉。”",
    ],
    facts: ["餐饮超支 ¥128", "先查三笔支出", "下周期再调整"],
    action: "调阅三笔主要支出",
    backdrop: "/scenes/county/council/strained/poster.webp",
    actors: [
      ["/characters/npc/comic/county/warning.webp", "钱粮小吏"],
      ["/characters/npc/advisor/county/warning.webp", "师爷"],
      ["/characters/npc/companion-female/county/warning.webp", "随行知己"],
    ],
  },
  {
    id: "05",
    title: "调阅支出",
    speaker: "师爷",
    line: "超支主要集中在三笔：同学聚餐 ¥420、夜宵 ¥238、外卖 ¥122，共计 ¥780。",
    facts: ["占餐饮支出 76%", "可查看详情", "可编辑或删除"],
    action: "生成调整草案",
    backdrop: "/previews/background/B-treasury.png",
    actors: [
      ["/characters/npc/advisor/county/neutral.webp", "师爷"],
      ["/characters/npc/comic/county/neutral.webp", "钱粮小吏"],
    ],
  },
  {
    id: "06",
    title: "调整草案",
    speaker: "师爷与随行知己",
    line: "本期餐饮额度 ¥900、实际 ¥1,028；下周期参考额度先拟为 ¥950，可继续修改。",
    facts: ["只保存下周期草案", "不改本期余额", "可修改、可删除"],
    action: "保存草案",
    backdrop: "/previews/background/B-council.png",
    actors: [
      ["/characters/npc/advisor/county/neutral.webp", "师爷"],
      ["/characters/npc/companion-female/county/neutral.webp", "随行知己"],
    ],
  },
  {
    id: "07",
    title: "政绩结算",
    speaker: "师爷",
    line: "本周期记录 6 笔，完成朝会 1 次，本次获得政绩 65。",
    facts: ["累计政绩 125", "下一阶 知府", "还差 35"],
    action: "生成散会备忘",
    backdrop: "/previews/background/B-council.png",
    actors: [
      ["/characters/npc/advisor/county/success.webp", "师爷"],
      ["/characters/player/female/county/stable.webp", "县令"],
      ["/characters/npc/comic/county/success.webp", "钱粮小吏"],
    ],
  },
  {
    id: "08",
    title: "散会备忘",
    speaker: "随行知己",
    line: "账已经看明白了，接下来照常记录就好。下次朝会再看看这份调整是否合适。",
    facts: ["本周期已锁定", "下次朝会：下周一", "草案可回看编辑"],
    action: "返回县衙",
    backdrop: "/scenes/county/council/stable/poster.webp",
    actors: [
      ["/characters/npc/companion-female/county/success.webp", "随行知己"],
      ["/characters/npc/advisor/county/success.webp", "师爷"],
    ],
  },
] as const;

const rooms = [
  ["hall", "县衙大堂"],
  ["treasury", "县库账房"],
  ["council", "县署议事厅"],
  ["works", "营造后院"],
] as const;

const fiscalStates = [
  ["stable", "财政丰盈", "风调雨顺、人员与陈设齐备"],
  ["strained", "预算超支／库正", "主体完好，但缩减人员、陈设与施工"],
  ["deficit", "县库亏空", "空置、典当、枯败与可见破损"],
] as const;

export default function ReviewPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">← 返回朝账原型</Link>
        <h1>朝账视觉与动态评审</h1>
        <p>
          B 背景已按“虚化且不干扰内容”应用到原型；这里集中查看完整 8 段游戏式朝会，
          并保留旧版 12 条动景作为问题对照。
        </p>
      </header>

      {backgroundGroups.map((group) => (
        <section className={styles.section} key={group.id}>
          <div className={styles.sectionHead}>
            <span>全局背景预览</span>
            <h2>{group.title}</h2>
            <p>{group.description}</p>
          </div>
          <div className={styles.portraitGrid}>
            {Object.entries(pageNames).map(([key, label]) => (
              <article className={styles.portraitCard} key={key}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/previews/background/${group.id}-${key}.png`}
                  alt={`${group.title}的${label}页面背景预览`}
                />
                <div className={styles.cardLabel}>
                  <strong>{label}</strong>
                  <span>{group.id} 方案</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span>游戏式朝会预览</span>
          <h2>视觉小说式八阶段完整朝会</h2>
          <p>
            每一段都给出角色动作、真实账目内容和明确下一步。当前发言者放大，其他角色仍留在场景中，不再只是四张概念图。
          </p>
        </div>
        <div className={styles.councilGrid}>
          {councilSteps.map((step) => (
            <article className={styles.councilCard} key={step.id}>
              <div className={styles.councilScene}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.councilBackdrop} src={step.backdrop} alt="" />
                <div className={styles.councilStepLabel}>
                  <span>{step.id} / 08</span>
                  <strong>{step.title}</strong>
                </div>
                <div className={styles.councilActors} data-count={step.actors.length}>
                  {step.actors.map(([src, name], index) => (
                    <figure className={styles.councilActor} key={`${step.id}-${name}`} data-focus={index === 0}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`${name}人物预览`} />
                      <figcaption>{name}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
              <div className={styles.councilDialogue}>
                <span>{step.speaker}</span>
                {"lines" in step ? (
                  <div className={styles.councilLines}>
                    {step.lines.map((line) => <p key={line}>{line}</p>)}
                  </div>
                ) : (
                  <p>“{step.line}”</p>
                )}
                <div className={styles.councilFacts}>
                  {step.facts.map((fact) => <b key={fact}>{fact}</b>)}
                </div>
                <div className={styles.previewAction}>
                  <small>下一步按钮预览</small>
                  <strong>{step.action} →</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span>旧版动态对照 · 已判定不通过</span>
          <h2>问题证据：只有光影，没有人物行动</h2>
          <p>
            下面 12 条只保留用于对照，不再作为交付结果。新版必须出现行走、搬运、鞠躬进谏和施工，
            并继续保持 4 秒、24 帧/秒、1280×720 的循环格式。
          </p>
        </div>
        {rooms.map(([room, roomLabel]) => (
          <div className={styles.roomGroup} key={room}>
            <h3>{roomLabel}</h3>
            <div className={styles.motionGrid}>
              {fiscalStates.map(([state, label, description]) => (
                <article className={styles.motionCard} key={state}>
                  <SceneMedia
                    media={getSceneMediaAsset("county", room, state)}
                    className={styles.motionMedia}
                    controls
                  />
                  <div className={styles.cardLabel}>
                    <strong>{label}</strong>
                    <span>{description}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
