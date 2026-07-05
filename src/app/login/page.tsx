import { redirect } from "next/navigation";
import { signIn, auth } from "@/auth";

export default async function LoginPage({
  searchParams
}: {
  searchParams: { error?: string; check?: string };
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  async function login(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    await signIn("resend", { email, redirectTo: "/" });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <form action={login} className="w-full max-w-sm rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-medium text-primary">OpenChat Zen</p>
          <h1 className="mt-2 text-2xl font-semibold">Connexion</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Recois un lien magique pour ouvrir ton espace de chat.
          </p>
        </div>
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3 outline-none focus:ring-2 focus:ring-primary"
          placeholder="toi@example.com"
        />
        {searchParams.error ? <p className="mt-3 text-sm text-red-600">Connexion impossible.</p> : null}
        {searchParams.check ? <p className="mt-3 text-sm text-primary">Verifie ta boite email.</p> : null}
        <button className="mt-5 h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground">
          Envoyer le lien
        </button>
      </form>
    </main>
  );
}
