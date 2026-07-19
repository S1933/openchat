import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Resend as ResendClient } from "resend";
import { prisma } from "@/lib/prisma";

const ALLOWED_EMAIL = "jeanphilippenuel@gmail.com";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // JWT sessions cut 2 DB round-trips (Session + User lookup) per /api/chat call.
  // Single-user app → no rotation concerns. Adapter is still here for Account/VerificationToken.
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM,
      // Block magic links to any address other than the allowlisted one.
      // Silently no-ops (no email sent, no DB row created) for everyone else.
      async sendVerificationRequest({ identifier, url, provider }) {
        if (identifier !== ALLOWED_EMAIL) return;
        const resend = new ResendClient(provider.apiKey!);
        await resend.emails.send({
          from: provider.from!,
          to: identifier,
          subject: "Sign in to OpenChat",
          text: `Click to sign in: ${url}\n`,
          html: `<p>Click <a href="${url}">here</a> to sign in to OpenChat.</p>`,
        });
      },
    }),
  ],
  callbacks: {
    // Defense-in-depth: even if a verification link somehow existed, this blocks
    // session creation for anyone whose email isn't on the allowlist.
    signIn({ user }) {
      if (!user?.email) return false;
      return user.email === ALLOWED_EMAIL;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
