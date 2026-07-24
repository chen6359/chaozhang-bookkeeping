import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "朝账｜让每一笔收支改变眼前的世界",
  description: "从九品县令开始，用真实收支治理一个由财务行为驱动的架空王朝。",
  openGraph: {
    title: "朝账｜让每一笔收支改变眼前的世界",
    description: "从九品县令开始，让真实财务行为改变你的官署世界。",
    type: "website",
    locale: "zh_CN",
    images: [
      {
        url: "/og.png",
        width: 1672,
        height: 941,
        alt: "朝账：同一座县衙因财务状态呈现兴盛与亏空两种面貌",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "朝账｜让每一笔收支改变眼前的世界",
    description: "从九品县令开始，让真实财务行为改变你的官署世界。",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
