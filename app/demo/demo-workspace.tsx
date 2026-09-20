"use client";

import ResearchApp from "../research-app";

export default function DemoWorkspace() {
  return <ResearchApp demo user={{ userId: "demo-visitor", displayName: "Demo", email: "", fullName: null }} />;
}
