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
    title: "B｜官署全景延伸",
    description:
      "每个页面都像真正进入对应房间，沉浸感更强；后续需要更严格处理文字可读性与资源体积。",
  },
] as const;

const councilSteps = [
  ["01-opening", "开议", "师爷宣告本周朝会开始"],
  ["02-finance", "财政汇报", "账册展开，先呈事实再谈建议"],
  ["03-issue", "核心议题", "三人提出不同视角，用户选择真实动作"],
  ["04-settlement", "政绩结算", "盖印、入档并锁定本周期朝会"],
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
          这是独立评审页，不代表背景方案已经应用。请先比较 A、B
          两套全局背景与朝会流程，再验收县令阶段 12 个 4 秒循环场景。
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
          <h2>视觉小说式四阶段朝会</h2>
          <p>
            当前发言角色放大，其他角色在场景中待机；文字、数字和真实按钮由程序叠加，不写死在图片里。
          </p>
        </div>
        <div className={styles.portraitGrid}>
          {councilSteps.map(([asset, title, description]) => (
            <article className={styles.portraitCard} key={asset}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/previews/council/${asset}.png`}
                alt={`${title}朝会界面预览`}
              />
              <div className={styles.cardLabel}>
                <strong>{title}</strong>
                <span>{description}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span>县令阶段动态样板</span>
          <h2>四个房间 × 三种财政状态</h2>
          <p>
            每条 4 秒、24 帧/秒、1280×720。视频首尾同相位；无法播放或开启“减少动态效果”时显示
            1600×900 高清海报。
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
