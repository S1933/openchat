import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChatShell } from "@/components/chat-shell";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <ChatShell email={session.user.email ?? "user"} />;
}
