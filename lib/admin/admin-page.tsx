// Admin page runner — the read-side twin of the Write Action Runner (ADR 0001).
// The write path hides its auth -> parse -> validate -> guard -> RPC ->
// revalidate -> log skeleton behind `runAdminWriteAction`; the read/page side
// never got the symmetric treatment, so ~20 admin pages copy-pasted the same
// wiring: `requireAdmin` -> unwrap `searchParams` / route `params` -> resolve
// params -> load data -> render `PageHeader` + body.
//
// `adminPage(spec)` owns that skeleton. A page supplies only the pure bits:
// the param resolver, an arbitrary async loader, the header copy, and the body
// renderer. The runner owns the admin guard, awaiting + threading
// `searchParams` / route `params`, the optional FrozenSurfaceBanner, the
// `PageHeader`, and the optional `fallback` -> Suspense streaming wrap.
//
// See docs/adr/0028-admin-page-runner.md (the read-side twin of ADR 0001).

import { Suspense, type ReactNode } from "react";

import { PageHeader } from "@/components/lg/PageHeader";
import { FrozenSurfaceBanner } from "@/components/lg/FrozenSurfaceBanner";
import { requireAdmin, type CurrentSession } from "@/lib/auth/session";

// The awaited Next page props, normalised to plain records. A page's `params`
// resolver reads whichever it needs (route params, query string) off this.
export type AdminPageRawArgs = {
  params: Record<string, string | string[] | undefined>;
  searchParams: Record<string, string | string[] | undefined>;
};

// The PageHeader copy the runner renders. A subset of PageHeader's props — the
// page chrome the standard admin surfaces actually vary (eyebrow / title /
// italic / lede). Derived from params so it can render ABOVE any Suspense
// boundary.
export type AdminPageHeader = {
  eyebrow?: ReactNode;
  title: ReactNode;
  italic?: ReactNode;
  lede?: ReactNode;
};

export type AdminPageSpec<TParams, TData> = {
  // Resolve typed params from the awaited `searchParams` / route `params`. Omit
  // for pages with no params (`TParams` is then `undefined`).
  params?: (raw: AdminPageRawArgs) => TParams;
  // An arbitrary async loader. All bespoke loading (parallel `Promise.all`,
  // threaded promises, `measureReadBundle`, multiple reads) lives here, so the
  // runner never has to model it. Receives the resolved params and the
  // admin session.
  load: (params: TParams, session: CurrentSession) => Promise<TData>;
  // PageHeader copy, derived from params (or static). Rendered immediately,
  // above any Suspense boundary.
  header: (params: TParams) => AdminPageHeader;
  // The body, given the loaded data and params. Owns its own `<PageBody>` and
  // any in-body chrome (the structure inside the body varies per surface).
  render: (data: TData, params: TParams) => ReactNode;
  // Optional. When present, the runner wraps the body in `<Suspense>` with this
  // fallback and lets the loader stream — the header renders immediately and
  // the body suspends. When absent, the runner awaits the loader inline.
  fallback?: ReactNode;
  // Optional. Render the shared FrozenSurfaceBanner above the header (for the
  // off-nav surfaces that still resolve by direct URL).
  frozenBanner?: boolean;
};

// The streamed body: an async child so the loader runs INSIDE the Suspense
// boundary (header already flushed) rather than blocking the page.
async function StreamedBody<TData>({
  load,
  render,
}: {
  load: () => Promise<TData>;
  render: (data: TData) => ReactNode;
}) {
  const data = await load();
  return <>{render(data)}</>;
}

// Build an admin page component from a spec. The returned async component is
// used directly as a route's `export default`.
export function adminPage<TParams = undefined, TData = unknown>(
  spec: AdminPageSpec<TParams, TData>
) {
  return async function AdminPage(props: {
    params?: Promise<Record<string, string | string[] | undefined>>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }): Promise<ReactNode> {
    const session = await requireAdmin();
    const raw: AdminPageRawArgs = {
      params: (await props.params) ?? {},
      searchParams: (await props.searchParams) ?? {},
    };
    const params = (spec.params ? spec.params(raw) : undefined) as TParams;
    const { eyebrow, title, italic, lede } = spec.header(params);

    const head = (
      <>
        {spec.frozenBanner ? <FrozenSurfaceBanner /> : null}
        <PageHeader
          eyebrow={eyebrow}
          title={title}
          italic={italic}
          lede={lede}
        />
      </>
    );

    if (spec.fallback !== undefined) {
      return (
        <>
          {head}
          <Suspense fallback={spec.fallback}>
            <StreamedBody
              load={() => spec.load(params, session)}
              render={(data: TData) => spec.render(data, params)}
            />
          </Suspense>
        </>
      );
    }

    const data = await spec.load(params, session);
    return (
      <>
        {head}
        {spec.render(data, params)}
      </>
    );
  };
}
