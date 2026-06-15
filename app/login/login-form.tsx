"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  errorTextClassName,
  fieldLabelClassName,
} from "@/components/admin/forms/field-styles";
import { loginAction, type LoginFormState } from "./actions";
import { isSafeNextPath } from "./next-path";

const INITIAL_STATE: LoginFormState = {};

// Fixed-position confirmation toast (see the CLS note below): info status note
// — soft sage bg + deep sage fg, no stripe. It floats, so it may carry shadow.
const statusToastClassName =
  "fixed left-1/2 top-4 z-toast m-0 w-[calc(100%-48px)] max-w-[460px] -translate-x-1/2 rounded-sm bg-sageSoft px-3 py-2.5 text-center font-sans text-sm text-sageDeep shadow-softLg";

// Field shell: the visible input box; the bare input inside stays
// borderless so the Show/Hide affordance can sit in the same box.
const fieldShellClassName =
  "flex items-center gap-2 rounded-sm border border-line bg-surface px-3 py-2.5 transition-colors duration-150 focus-within:border-sage";

const bareInputClassName =
  "w-full border-0 bg-transparent p-0 font-sans text-base text-ink outline-none";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    INITIAL_STATE
  );
  const [showPassword, setShowPassword] = useState(false);
  // Read the sign-in search params on the client so this page can be statically
  // generated and CDN-served (no per-request server render). Using
  // window.location.search rather than next/navigation's useSearchParams()
  // avoids forcing a Suspense boundary / dynamic deopt, so the form markup still
  // ships in the prerendered HTML. The `next` allow-list is shared with the
  // server action via isSafeNextPath, keeping one source of truth for the
  // open-redirect guard.
  const [next, setNext] = useState<string | null>(null);
  const [resetOk, setResetOk] = useState(false);
  const [invitedOk, setInvitedOk] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextValue = params.get("next");
    /* eslint-disable react-hooks/set-state-in-effect --
       Client-only one-shot read of the statically prerendered page's URL. These
       values cannot be known until mount (no per-request server render), and
       deriving them via a lazy initializer would cause a hydration mismatch — so
       deferring the read to a mount effect is the correct hydration-safe
       pattern, not the cascading-render smell the rule targets. */
    setNext(nextValue && isSafeNextPath(nextValue) ? nextValue : null);
    setResetOk(params.get("reset") === "ok");
    setInvitedOk(params.get("invited") === "1");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  return (
    <>
      {/* The reset confirmation is the one piece of per-URL content that only
          becomes known client-side (after the useEffect reads ?reset=ok). On a
          statically-prerendered page it can't be in the first paint, so render
          it as a fixed-position toast (out of normal flow) rather than an inline
          banner: that way its post-hydration appearance can't push the centered
          form down, avoiding a CLS the rest of the page doesn't have. */}
      {resetOk && !state.error ? (
        <p role="status" className={statusToastClassName}>
          Password updated. Sign in.
        </p>
      ) : null}

      {invitedOk && !resetOk && !state.error ? (
        <p role="status" className={statusToastClassName}>
          Account created. Sign in with your new email and password.
        </p>
      ) : null}

      <form action={formAction} className="flex flex-col gap-3">
        {/* Always rendered (value defaults to "") so it ships in the static
            HTML and hydrates without a structural mismatch; the effect fills in
            the validated `next` on mount. An empty value is treated as "no
            next" by loginAction (isSafeNextPath rejects ""), matching the
            previous behavior. */}
        <input type="hidden" name="next" value={next ?? ""} />

        {state.error ? (
          <p role="alert" className={errorTextClassName}>
            {state.error}
          </p>
        ) : null}

        <div>
          <label htmlFor="email" className={fieldLabelClassName}>
            Email
          </label>
          <div className={fieldShellClassName}>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              disabled={pending}
              className={bareInputClassName}
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className={fieldLabelClassName}>
            Password
          </label>
          <div className={fieldShellClassName}>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              disabled={pending}
              className={bareInputClassName}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              disabled={pending}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="shrink-0 border-0 bg-transparent p-0 font-sans text-xs font-semibold text-ink3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <Link
          href="/forgot-password"
          className="self-end font-sans text-sm font-medium text-sageDeep no-underline"
        >
          Forgot password?
        </Link>

        <Button
          type="submit"
          variant="primary"
          disabled={pending}
          className="w-full"
        >
          {pending ? "Signing in…" : "Sign in"}
          <ArrowRight size={15} strokeWidth={2} aria-hidden />
        </Button>
      </form>
    </>
  );
}
