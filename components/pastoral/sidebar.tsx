"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Sun,
  Users,
  Layers,
  ClipboardCheck,
  Sprout,
  Flag,
  Calendar,
  Settings,
  Star,
  Home,
  Search,
  Bell,
  Menu,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import type { Persona, UserRole } from "@/lib/auth/roles";

export type SidebarItem = {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
  group: "top" | "manage" | "shepherd" | "system";
};

const GROUP_LABELS: Record<SidebarItem["group"], string> = {
  top: "",
  manage: "Manage",
  shepherd: "Shepherd",
  system: "System",
};

const ICON_SIZE = 16;
const STROKE = 1.6;
const navIcon = (Component: typeof Sun) => (
  <Component size={ICON_SIZE} strokeWidth={STROKE} aria-hidden="true" />
);

export const ADMIN_SIDEBAR: SidebarItem[] = [
  { key: "admin", label: "This week", href: "/admin", icon: navIcon(Sun), group: "top" },
  {
    key: "people",
    label: "People",
    href: "/admin/people",
    icon: navIcon(Users),
    group: "manage",
  },
  {
    key: "groups",
    label: "Groups",
    href: "/admin/groups",
    icon: navIcon(Layers),
    group: "manage",
  },
  {
    key: "checkins",
    label: "Check-ins",
    href: "/admin/check-ins",
    icon: navIcon(ClipboardCheck),
    group: "manage",
  },
  {
    key: "guests",
    label: "Guests",
    href: "/admin/guests",
    icon: navIcon(Sprout),
    group: "shepherd",
  },
  {
    key: "followups",
    label: "Follow-ups",
    href: "/admin/follow-ups",
    icon: navIcon(Flag),
    group: "shepherd",
  },
  {
    key: "calendar",
    label: "Calendar",
    href: "/admin/calendar",
    icon: navIcon(Calendar),
    group: "shepherd",
  },
  {
    key: "settings",
    label: "Settings",
    href: "/admin/settings",
    icon: navIcon(Settings),
    group: "system",
  },
  {
    key: "super",
    label: "Super admin",
    href: "/admin/super-admin",
    icon: navIcon(Star),
    group: "system",
  },
];

export const LEADER_SIDEBAR: SidebarItem[] = [
  { key: "leader", label: "My groups", href: "/leader", icon: navIcon(Home), group: "top" },
];

export function sidebarForPersona(
  persona: Persona,
  options: { includeSuperAdmin?: boolean } = {},
): SidebarItem[] {
  if (persona === "leader") return LEADER_SIDEBAR;
  return options.includeSuperAdmin
    ? ADMIN_SIDEBAR
    : ADMIN_SIDEBAR.filter((item) => item.key !== "super");
}

function bestMatchHref(pathname: string | null, items: SidebarItem[]): string | null {
  if (!pathname) return null;
  let bestHref: string | null = null;
  let bestScore = -1;
  for (const item of items) {
    let score = -1;
    if (pathname === item.href) {
      score = item.href.length + 1;
    } else if (pathname.startsWith(`${item.href}/`)) {
      score = item.href.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestHref = item.href;
    }
  }
  return bestHref;
}

function Wordmark() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 6px 24px",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          overflow: "hidden",
          flexShrink: 0,
          background: "var(--c-sage)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <Image
          src="/fvc-logo.svg"
          alt="Fox Valley Church"
          width={28}
          height={28}
          priority
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 500,
            color: "var(--c-ink)",
          }}
        >
          Life Groups
        </span>
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 10,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: "var(--c-ink3)",
          }}
        >
          Fox Valley Church
        </span>
      </div>
    </div>
  );
}

function PersonaSwitcher({
  persona,
  available,
}: {
  persona: Persona;
  available: Persona[];
}) {
  if (available.length < 2) return null;
  const allOptions: { key: Persona; label: string; href: string; disabled?: string }[] = [
    { key: "admin", label: "Admin", href: "/admin" },
    {
      key: "leader",
      label: "Leader",
      href: "/leader",
      // super_admin / ministry_admin previewing /leader currently triggers
      // requireLeader() → redirect to /unauthorized. Keep the tab visible
      // so the design intent comes through; mark it disabled with a
      // tooltip until a dedicated preview path lands.
      disabled:
        persona === "leader"
          ? undefined
          : "Leader preview is not available — switch a profile to a leader role to use the /leader workflow.",
    },
  ];
  const options = allOptions.filter((option) => available.includes(option.key));

  return (
    <div
      style={{
        display: "flex",
        padding: 3,
        background: "var(--c-surfaceAlt)",
        borderRadius: 10,
        border: "1px solid var(--c-line)",
      }}
    >
      {options.map((option) => {
        const active = persona === option.key;
        const disabled = !!option.disabled && !active;
        const commonStyle: React.CSSProperties = {
          flex: 1,
          padding: "6px 10px",
          borderRadius: 7,
          background: active ? "var(--c-surface)" : "transparent",
          border: "none",
          color: active
            ? "var(--c-ink)"
            : disabled
              ? "var(--c-ink4)"
              : "var(--c-ink3)",
          fontFamily: "var(--font-body)",
          fontSize: 12,
          fontWeight: 600,
          textAlign: "center",
          textDecoration: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          boxShadow: active ? "var(--c-shadow)" : "none",
        };
        if (disabled) {
          return (
            <span
              key={option.key}
              title={option.disabled}
              aria-disabled="true"
              style={commonStyle}
            >
              {option.label}
            </span>
          );
        }
        return (
          <Link key={option.key} href={option.href} style={commonStyle}>
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

function Verse() {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        background: "var(--c-sageTint)",
        border: "1px solid var(--c-line)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 9.5,
          letterSpacing: 1.8,
          textTransform: "uppercase",
          fontWeight: 700,
          color: "var(--c-clay)",
          marginBottom: 8,
        }}
      >
        Why we&apos;re here
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 15,
          lineHeight: 1.3,
          color: "var(--c-ink)",
          fontWeight: 500,
        }}
      >
        Telling and <span style={{ fontStyle: "italic" }}>showing</span> the story of
        Jesus.
      </div>
      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid var(--c-sageSoft)",
          fontFamily: "var(--font-display)",
          fontSize: 11.5,
          lineHeight: 1.5,
          color: "var(--c-ink2)",
          fontStyle: "italic",
        }}
      >
        &ldquo;Jesus Christ is the one we proclaim&hellip; so that we may present
        everyone fully mature in Christ.&rdquo;
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 9.5,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "var(--c-ink4)",
          marginTop: 6,
          fontWeight: 600,
        }}
      >
        Colossians 1:28
      </div>
    </div>
  );
}

function NavList({
  items,
  activeHref,
  onNavigate,
}: {
  items: SidebarItem[];
  activeHref: string | null;
  onNavigate?: () => void;
}) {
  const groups = new Map<SidebarItem["group"], SidebarItem[]>();
  items.forEach((item) => {
    const arr = groups.get(item.group) ?? [];
    arr.push(item);
    groups.set(item.group, arr);
  });
  return (
    <nav
      style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}
    >
      {Array.from(groups.entries()).map(([groupKey, groupItems]) => (
        <div key={groupKey}>
          {GROUP_LABELS[groupKey] ? (
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.8,
                textTransform: "uppercase",
                color: "var(--c-ink4)",
                padding: "6px 10px",
                fontWeight: 600,
              }}
            >
              {GROUP_LABELS[groupKey]}
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {groupItems.map((item) => {
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: active ? "var(--c-surface)" : "transparent",
                    border: active
                      ? "1px solid var(--c-line)"
                      : "1px solid transparent",
                    color: active ? "var(--c-ink)" : "var(--c-ink2)",
                    fontSize: 13.5,
                    fontWeight: active ? 600 : 500,
                    textDecoration: "none",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      color: active ? "var(--c-sageDeep)" : "var(--c-ink3)",
                    }}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

type SidebarUser = { name: string; email: string | null; role: UserRole };

type SidebarContentProps = {
  persona: Persona;
  availablePersonas: Persona[];
  items: SidebarItem[];
  currentUser?: SidebarUser;
  // When `true`, the user identity + sign-out footer renders below the
  // Verse card. We pass `true` in the mobile drawer so users on small
  // screens (where the topbar's UserPill + LogoutButton are hidden via
  // `lg-m-userpill-text` / `lg-m-signout-hide`) still have a sign-out
  // path. Desktop sidebar leaves this off so the topbar stays the single
  // visible identity surface.
  showUserBlock?: boolean;
  onNavigate?: () => void;
};

function SidebarUserBlock({ user }: { user: SidebarUser }) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: 12,
        borderRadius: 10,
        background: "var(--c-surface)",
        border: "1px solid var(--c-line)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <UserPill
        name={user.name}
        email={user.email}
        role={user.role}
        variant="drawer"
      />
      <LogoutButton className="" />
    </div>
  );
}

function SidebarContent({
  persona,
  availablePersonas,
  items,
  currentUser,
  showUserBlock,
  onNavigate,
}: SidebarContentProps) {
  const pathname = usePathname();
  const activeHref = bestMatchHref(pathname, items);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "22px 16px 16px",
      }}
    >
      <Wordmark />
      <PersonaSwitcher persona={persona} available={availablePersonas} />
      <NavList items={items} activeHref={activeHref} onNavigate={onNavigate} />
      <div style={{ marginTop: "auto", paddingTop: 16 }}>
        <Verse />
        {showUserBlock && currentUser ? (
          <SidebarUserBlock user={currentUser} />
        ) : null}
      </div>
    </div>
  );
}

export function Sidebar(props: SidebarContentProps) {
  return (
    <aside
      aria-label="Primary navigation"
      className="lg-m-sidebar"
      style={{
        width: 232,
        flexShrink: 0,
        background: "var(--c-sidebar)",
        borderRight: "1px solid var(--c-line)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-body)",
        position: "sticky",
        top: 0,
        height: "100vh",
        overflow: "auto",
      }}
    >
      <SidebarContent {...props} />
    </aside>
  );
}

export function MobileSidebarDrawer({
  open,
  onOpenChange,
  ...rest
}: SidebarContentProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(58, 42, 26, 0.45)",
            zIndex: 60,
          }}
        />
        <DialogContent
          aria-describedby={undefined}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
            height: "100dvh",
            width: "min(260px, 86vw)",
            background: "var(--c-sidebar)",
            borderRight: "1px solid var(--c-line)",
            borderRadius: 0,
            padding: 0,
            zIndex: 61,
            boxShadow: "var(--c-shadowLg)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <SidebarContent
              {...rest}
              onNavigate={() => {
                onOpenChange(false);
                rest.onNavigate?.();
              }}
            />
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

export function TopBar({
  persona,
  availablePersonas,
  items,
  currentUser,
  trailing,
}: {
  persona: Persona;
  availablePersonas: Persona[];
  items: SidebarItem[];
  currentUser?: SidebarUser;
  trailing?: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div
      className="lg-m-topbar"
      style={{
        height: 56,
        borderBottom: "1px solid var(--c-line)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 32px",
        background: "var(--c-bg)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <button
        type="button"
        className="lg-m-topbar-trigger"
        aria-label="Open menu"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen(true)}
        style={{
          display: "none",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          padding: 0,
          borderRadius: 8,
          background: "var(--c-surface)",
          border: "1px solid var(--c-line)",
          color: "var(--c-ink)",
          cursor: "pointer",
        }}
      >
        <Menu size={18} strokeWidth={1.7} aria-hidden="true" />
      </button>

      <div
        className="lg-m-topbar-search"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontFamily: "var(--font-body)",
          fontSize: 12.5,
          color: "var(--c-ink3)",
        }}
      >
        <Search size={14} strokeWidth={1.6} aria-hidden="true" />
        <span>Search people, groups, guests&hellip;</span>
        <kbd
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 4,
            background: "var(--c-surfaceAlt)",
            border: "1px solid var(--c-line)",
            color: "var(--c-ink3)",
          }}
        >
          ⌘K
        </kbd>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          type="button"
          aria-label="Notifications"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--c-ink3)",
            display: "grid",
            placeItems: "center",
            padding: 6,
            borderRadius: 6,
          }}
        >
          <Bell size={17} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <div style={{ width: 1, height: 22, background: "var(--c-line)" }} />
        {trailing}
      </div>

      <MobileSidebarDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        persona={persona}
        availablePersonas={availablePersonas}
        items={items}
        currentUser={currentUser}
        showUserBlock
      />
    </div>
  );
}
