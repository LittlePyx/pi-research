"use client";
import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="pi-system-page"><span>Pi Research</span><h2>这个页面暂时未能打开</h2><p>可以重试加载，或返回工作区继续查看其他内容。</p><div><button type="button" onClick={reset}>重新加载</button><Link href="/">返回研究工作区 →</Link></div></main>;
}
