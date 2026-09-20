import type { Metadata } from "next";
import DemoWorkspace from "./demo-workspace";

export const metadata: Metadata = {
  title: "Pi Research 演示空间",
  description: "体验研究路线、论文阅读、材料比较与学习路径。公开文献样例，与正式研究空间隔离。",
};

export default function DemoPage() {
  return <DemoWorkspace />;
}
