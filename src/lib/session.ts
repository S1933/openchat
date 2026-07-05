import { auth } from "@/auth";

export async function requireUserId() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Response("Unauthorized", { status: 401 });
  return id;
}
