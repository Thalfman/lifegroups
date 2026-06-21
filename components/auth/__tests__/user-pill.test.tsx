// @vitest-environment jsdom
/* eslint-disable jsx-a11y/aria-role -- `role` here is a UserPill component prop
   (a UserRole), not a DOM ARIA role. */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UserPill } from "@/components/auth/user-pill";
import { ROLE_LABELS } from "@/lib/auth/roles";

// UserPill renders on every authed page (header + nav drawer). A thin contract
// test so a broken name/email/role-badge render surfaces here, not late in QA.

afterEach(cleanup);

describe("UserPill", () => {
  it("renders the name, email, and the role's label badge", () => {
    render(
      <UserPill
        name="Julian Admin"
        email="julian@example.com"
        role="ministry_admin"
      />
    );

    expect(screen.getByText("Julian Admin")).toBeTruthy();
    expect(screen.getByText("julian@example.com")).toBeTruthy();
    expect(screen.getByText(ROLE_LABELS.ministry_admin)).toBeTruthy();
  });

  it("omits the email line when email is null but still shows name + role", () => {
    render(<UserPill name="No Email" email={null} role="leader" />);

    expect(screen.getByText("No Email")).toBeTruthy();
    expect(screen.getByText(ROLE_LABELS.leader)).toBeTruthy();
    expect(screen.queryByText("@")).toBeNull();
  });

  it("renders the drawer variant without throwing", () => {
    render(
      <UserPill
        name="Drawer User"
        email="d@example.com"
        role="over_shepherd"
        variant="drawer"
      />
    );

    expect(screen.getByText("Drawer User")).toBeTruthy();
    expect(screen.getByText(ROLE_LABELS.over_shepherd)).toBeTruthy();
  });
});
