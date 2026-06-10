import Image from "next/image";
import { LoginForm } from "@/app/login/login-form";

export function SignInScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 py-12 font-sans text-ink">
      <div className="flex w-full max-w-[460px] flex-col gap-7">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/logo.png"
            width={40}
            height={40}
            alt=""
            priority
            className="block"
          />
          <div className="mt-2.5 font-display text-lg font-medium text-ink">
            Life Groups
          </div>
          {/* The page kicker — the one tracked-uppercase voice per page. */}
          <div className="mt-1 font-sans text-2xs font-semibold uppercase tracking-[0.16em] text-ink3">
            Fox Valley Church
          </div>
        </div>

        <h1 className="m-0 text-center font-display text-3xl font-normal text-ink">
          Welcome back.
        </h1>

        {/* Card anatomy: border, no shadow (the ghost border+shadow combo retires). */}
        <div className="rounded-lg border border-line bg-surface p-card md:p-7">
          <LoginForm />
        </div>

        {/* The verse — brand voice, restructured like the sidebar Verse
            (soft sage panel, no left stripe). */}
        <aside className="rounded-sm border border-line bg-sageTint px-4 py-3.5">
          <p className="m-0 text-pretty font-display text-base italic leading-relaxed text-ink2">
            &ldquo;Jesus Christ is the one we proclaim, admonishing and teaching
            everyone with all wisdom, so that we may present everyone fully
            mature in Christ.&rdquo;
          </p>
          <p className="mb-0 mt-2.5 border-t border-sageSoft pt-2.5 font-sans text-2xs font-semibold uppercase tracking-[0.12em] text-ink3">
            Colossians 1:28
          </p>
        </aside>
      </div>
    </main>
  );
}
