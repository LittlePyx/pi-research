import { getChatGPTUser } from "./chatgpt-auth";
import ResearchApp from "./research-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const signedInUser = await getChatGPTUser();
  const user = signedInUser ?? {
    userId: "local-demo-user",
    displayName: "Yilin",
    email: "demo@pi.local",
    fullName: "Yilin",
  };

  return <ResearchApp user={user} signedIn={Boolean(signedInUser)} />;
}
