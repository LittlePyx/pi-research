"use client";

import { useState } from "react";

type Props = {
  title: string; locale: "zh" | "en"; demo: boolean; model: string;
  status: string; connected: boolean; credentialSource: "browser" | "server" | null;
  busy: boolean; apiKey: string; error: string; recovered: boolean; recoveryDetail: string;
  onClose: () => void; onCheck: () => void; onKey: (value: string) => void;
  onSave: () => void; onRemove: () => void; onResume: () => void;
};

export function ModelSettingsPanel(props: Props) {
  const { locale, demo, busy, credentialSource } = props;
  const zh = locale === "zh";
  const [visible, setVisible] = useState(false);
  return <div className="v2-model-settings pi-model-panel">
    <header className="pi-model-heading"><h2>{props.title}</h2><button type="button" aria-label={zh ? "关闭" : "Close"} onClick={props.onClose}>×</button></header>
    <div className="pi-model-content">
      <section className="pi-model-provider" aria-label={zh ? "当前模型" : "Current model"}>
        <div className="pi-model-symbol" aria-hidden="true">∿</div>
        <div><strong>{props.model}</strong><span>{demo ? (zh ? "模型预览" : "Model preview") : credentialSource === "server" ? (zh ? "平台配置" : "Host configuration") : (zh ? "当前浏览器" : "This browser")}</span></div>
        {!demo && <span className={`pi-model-connection ${props.connected ? "connected" : ""}`} role="status"><i />{props.status}</span>}
      </section>
      {demo ? <section className="pi-model-demo">
        <h3>{zh ? "演示空间无需配置" : "No setup needed for the demo"}</h3>
        <p>{zh ? "你可以继续体验论文阅读与研究流程。连接模型后，即可在正式工作区使用 AI 问答和论文分析。" : "Explore reading and research here. Connect a model in your workspace to use AI questions and paper analysis."}</p>
        <div className="pi-model-footer"><button type="button" className="pi-model-secondary" onClick={props.onClose}>{zh ? "继续体验" : "Keep exploring"}</button><button type="button" className="pi-model-primary" onClick={() => window.location.assign("/")}>{zh ? "前往正式工作区" : "Open workspace"}<span aria-hidden="true">↗</span></button></div>
      </section> : <>
        <form className="pi-model-form" onSubmit={event => { event.preventDefault(); props.onSave(); }}>
          <div className="pi-model-field-title"><label htmlFor="pi-model-key">{credentialSource === "browser" ? (zh ? "替换 API Key" : "Replace API key") : "API Key"}</label><button type="button" className="pi-model-text" disabled={busy} onClick={props.onCheck}>{busy ? (zh ? "检测中…" : "Checking…") : (zh ? "检测连接" : "Check connection")}</button></div>
          <div className="pi-model-input"><input id="pi-model-key" type={visible ? "text" : "password"} value={props.apiKey} disabled={busy} onChange={event => props.onKey(event.target.value)} placeholder={zh ? "粘贴 DeepSeek API Key" : "Paste your DeepSeek API key"} autoComplete="off" spellCheck={false} /><button type="button" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? (zh ? "隐藏" : "Hide") : (zh ? "显示" : "Show")}</button></div>
          <p className="pi-model-hint">{zh ? "仅保存在当前浏览器，30 天后失效。" : "Saved only in this browser; expires after 30 days."}</p>
          {props.error && <p className="pi-model-error" role="alert">{props.error}</p>}
          <div className="pi-model-footer">{credentialSource === "browser" ? <button className="pi-model-text pi-model-remove" type="button" disabled={busy} onClick={props.onRemove}>{zh ? "移除 Key" : "Remove key"}</button> : <button className="pi-model-secondary" type="button" onClick={props.onClose}>{zh ? "取消" : "Cancel"}</button>}<button className="pi-model-primary" type="submit" disabled={busy || !props.apiKey.trim()}>{busy ? (zh ? "正在验证…" : "Verifying…") : (zh ? "验证并保存" : "Verify & save")}</button></div>
        </form>
        {props.recovered && <section className="pi-model-recovery"><strong>{zh ? "连接已恢复，原有进度已保留" : "Connection restored; progress retained"}</strong><p>{props.recoveryDetail}</p><button className="pi-model-text" type="button" onClick={props.onResume}>{zh ? "继续扫描 →" : "Resume discovery →"}</button></section>}
        <details className="pi-model-details"><summary>{zh ? "凭据保存与后台扫描" : "Credential storage and background discovery"}</summary><p>{zh ? "Key 受保护地保存在当前浏览器，不写入论文数据库。网页发起的扫描和 AI 功能使用此配置；无人打开网页时的后台扫描仍需平台 Key。" : "The key is protected in this browser and is never stored in the paper database. Browser-started scans and AI use this configuration; unattended background scans require a host key."}</p></details>
      </>}
    </div>
  </div>;
}
