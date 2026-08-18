import ResearchApp from "./research-app";

export default function Home() {
  return <ResearchApp user={{
    userId: "anonymous-browser",
    displayName: "Researcher",
    email: "",
    fullName: null,
  }} />;
}
