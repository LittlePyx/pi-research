import Link from "next/link";

export default function NotFound() {
  return <main className="pi-system-page"><span>Pi Research</span><h1>没有找到这个页面</h1><p>链接可能已经失效，或当前页面不再可用。可以返回工作区继续查找论文和研究记录。</p><Link href="/">返回研究工作区 →</Link></main>;
}
