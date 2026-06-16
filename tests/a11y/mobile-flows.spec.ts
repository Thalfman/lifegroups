import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness, HARNESS } from "./harness";

// 375px mobile regression assertions for the four priority admin flows (#651).
//
// Runs on the mobile-iphone / mobile-android (Chromium) and mobile-webkit
// (Safari-engine) projects defined in playwright.config.ts. WebKit is the
// closest faithful proxy to iPhone Safari and stands in for the unstaffed
// physical-device pass; the WebKit project carries `hasTouch`, so the
// WebKit-only safe-area + touch checks have a real touch engine to exercise.
//
// Every flow is driven against the gated /a11y-harness route and pinned to the
// 375px floor (the narrowest supported phone) regardless of the project's own
// viewport, then asserted against the product-approved thresholds:
//
//   - Tap targets — primary actions ≥ 44×44 CSS px; all other interactive
//     controls (row menus, icon buttons, inline controls) ≥ 24×24.
//   - Font floor — form inputs ≥ 16px (the global mobile guard that also blocks
//     iOS focus-zoom); primary action text ≥ 14px.
//   - No horizontal overflow — the flow's region never widens past its box.
//   - No clipped / overlapped primary action — each primary's box sits inside
//     the 375px viewport and receives the hit at its own centre.
//   - axe clean — no critical/serious violations in the asserted state.
//
// WebKit-only, additionally:
//   - Safe-area — the viewport opts into `viewport-fit=cover` and the
//     full-screen editing sheet pads itself with `env(safe-area-inset-*)`.
//   - Touch — the flow opens and an in-drawer field focuses via real touch taps.

const PHONE = { width: 375, height: 812 };

// Product-approved thresholds. A small slack absorbs sub-pixel rounding.
const PRIMARY_TAP_MIN = 44;
const CONTROL_TAP_MIN = 24;
const INPUT_FONT_MIN = 16;
const ACTION_FONT_MIN = 14;
const SLACK = 0.5;

const HOME = '[data-a11y-surface="home"]';

type Flow = {
  name: string;
  // Whether the asserted state is the EditingSurface drawer (vs. an in-page
  // region like the setup checklist).
  isDrawer: boolean;
  // Navigate to the harness in the right state for this flow.
  goto: (page: Page) => Promise<void>;
  // Drive the flow to its asserted state, opening via click or touch tap. A
  // no-op for flows whose asserted state is already on the page.
  open: (page: Page, method: "click" | "tap") => Promise<void>;
  // The region the per-control checks scope to once `open` has run.
  region: (page: Page) => Locator;
  // The flow's primary action(s) — the thing the user came to do.
  primaries: (region: Locator) => Locator[];
};

async function gotoSetupHome(page: Page): Promise<void> {
  const response = await page.goto(`${HARNESS}?homeVariant=setup`, {
    waitUntil: "networkidle",
  });
  expect(response?.status(), "harness route must be enabled").toBe(200);
  await expect(page.locator(HOME)).toBeVisible();
}

// Open a surface's drawer trigger with the chosen input method, so the touch
// path exercises a real tap rather than a synthetic click.
async function trigger(
  control: Locator,
  method: "click" | "tap"
): Promise<void> {
  if (method === "tap") {
    await control.tap();
  } else {
    await control.click();
  }
}

const FLOWS: Flow[] = [
  {
    name: "first-run setup",
    isDrawer: false,
    goto: gotoSetupHome,
    open: async () => {
      // The setup checklist is already on the page in the setup variant.
    },
    region: (page) =>
      page.locator(
        `${HOME} section[aria-labelledby="setup-recovery-checklist"]`
      ),
    primaries: (region) => [
      region.getByRole("link", { name: /Import people/ }),
      region.getByRole("link", { name: /Assign leaders/ }),
      region.getByRole("link", { name: /Assess health/ }),
    ],
  },
  {
    name: "group staffing",
    isDrawer: true,
    goto: gotoHarness,
    open: async (page, method) => {
      const surface = page.locator('[data-a11y-surface="group-roster"]');
      await trigger(
        surface.getByRole("button", {
          name: "Add a new leader to this group",
        }),
        method
      );
      await expect(
        page
          .getByRole("dialog")
          .getByRole("heading", { name: "Add a new leader to this group" })
      ).toBeVisible();
    },
    region: (page) => page.getByRole("dialog"),
    primaries: (region) => [
      region.getByRole("button", { name: "Add leader to group" }),
    ],
  },
  {
    name: "adding a person",
    isDrawer: true,
    goto: gotoHarness,
    open: async (page, method) => {
      const surface = page.locator('[data-a11y-surface="people"]');
      await trigger(
        surface.getByRole("button", { name: "Add person" }),
        method
      );
      await expect(
        page.getByRole("dialog").getByRole("heading", { name: "Add a person" })
      ).toBeVisible();
    },
    region: (page) => page.getByRole("dialog"),
    primaries: (region) => [
      region.getByRole("button", { name: "Add leader", exact: true }),
    ],
  },
  {
    name: "follow-up creation",
    isDrawer: true,
    goto: gotoHarness,
    open: async (page, method) => {
      const surface = page.locator('[data-a11y-surface="follow-ups"]');
      await trigger(
        surface.getByRole("button", { name: "Add follow-up" }),
        method
      );
      await expect(
        page
          .getByRole("dialog")
          .getByRole("heading", { name: "Add a follow-up" })
      ).toBeVisible();
    },
    region: (page) => page.getByRole("dialog"),
    primaries: (region) => [
      region.getByRole("button", { name: "Add follow-up", exact: true }),
    ],
  },
];

async function boundingBoxOf(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box, "control must render a box").not.toBeNull();
  return box!;
}

// Primary actions clear the 44px comfortable minimum; every other interactive
// control in the flow clears the 24px floor.
async function expectTapTargets(
  region: Locator,
  primaries: Locator[]
): Promise<void> {
  for (const primary of primaries) {
    await expect(primary).toBeVisible();
    const box = await boundingBoxOf(primary);
    expect(
      box.width,
      `primary action width ${box.width}px < ${PRIMARY_TAP_MIN}px`
    ).toBeGreaterThanOrEqual(PRIMARY_TAP_MIN - SLACK);
    expect(
      box.height,
      `primary action height ${box.height}px < ${PRIMARY_TAP_MIN}px`
    ).toBeGreaterThanOrEqual(PRIMARY_TAP_MIN - SLACK);
  }

  // The 24px floor for the rest: buttons, menu disclosures, and tab controls.
  // Inline prose links carry the WCAG 2.2 inline exception and are excluded.
  const controls = region.locator(
    'button, [role="button"], [role="tab"], summary'
  );
  const count = await controls.count();
  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i);
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    if (!box) continue;
    const label = (await control.getAttribute("aria-label")) ?? "";
    expect(
      box.width,
      `control "${label}" width ${box.width}px < ${CONTROL_TAP_MIN}px`
    ).toBeGreaterThanOrEqual(CONTROL_TAP_MIN - SLACK);
    expect(
      box.height,
      `control "${label}" height ${box.height}px < ${CONTROL_TAP_MIN}px`
    ).toBeGreaterThanOrEqual(CONTROL_TAP_MIN - SLACK);
  }
}

async function fontSizeOf(locator: Locator): Promise<number> {
  return locator.evaluate((node) =>
    parseFloat(getComputedStyle(node as Element).fontSize)
  );
}

// Form fields stay ≥16px (no iOS focus-zoom) and primary action text stays
// ≥14px (never sub-readable).
async function expectFontFloor(
  region: Locator,
  primaries: Locator[]
): Promise<void> {
  const fields = region.locator(
    'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), select, textarea'
  );
  const fieldCount = await fields.count();
  for (let i = 0; i < fieldCount; i += 1) {
    const field = fields.nth(i);
    if (!(await field.isVisible())) continue;
    const size = await fontSizeOf(field);
    expect(
      size,
      `form field ${i} font-size ${size}px < ${INPUT_FONT_MIN}px (iOS focus-zoom risk)`
    ).toBeGreaterThanOrEqual(INPUT_FONT_MIN - SLACK);
  }

  for (const primary of primaries) {
    const size = await fontSizeOf(primary);
    expect(
      size,
      `primary action font-size ${size}px < ${ACTION_FONT_MIN}px`
    ).toBeGreaterThanOrEqual(ACTION_FONT_MIN - SLACK);
  }
}

async function expectNoHorizontalOverflow(region: Locator): Promise<void> {
  await expect(region).toBeVisible();
  const overflow = await region.evaluate((el) => {
    const target = el as HTMLElement;
    return target.scrollWidth - target.clientWidth;
  });
  expect(
    overflow,
    `region overflows its content box by ${overflow}px at 375px`
  ).toBeLessThanOrEqual(1);
}

// Each primary action's box sits fully inside the viewport on all four edges,
// and the action itself receives the hit at its own centre (nothing covers it).
// Disabled controls set `pointer-events: none`, so only the hit-test is skipped
// for them — the in-viewport box check (all four edges) still applies.
async function expectPrimaryUnobstructed(
  page: Page,
  primary: Locator
): Promise<void> {
  const viewportHeight = page.viewportSize()?.height ?? PHONE.height;
  const box = await boundingBoxOf(primary);
  expect(
    box.x,
    "primary action clipped at the left edge"
  ).toBeGreaterThanOrEqual(-1);
  expect(
    box.x + box.width,
    `primary action runs past the 375px viewport (right edge ${box.x + box.width}px)`
  ).toBeLessThanOrEqual(PHONE.width + 1);
  // Vertical bounds matter for the (initially disabled) submit bars: a primary
  // clipped under the top edge or the home indicator must fail, not slip through
  // the disabled early-return below.
  expect(
    box.y,
    "primary action clipped at the top edge"
  ).toBeGreaterThanOrEqual(-1);
  expect(
    box.y + box.height,
    `primary action runs past the bottom edge (${box.y + box.height}px > ${viewportHeight}px)`
  ).toBeLessThanOrEqual(viewportHeight + 1);

  if (await primary.isDisabled().catch(() => false)) return;

  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const receivesHit = await primary.evaluate((node, point) => {
    const top = document.elementFromPoint(point.x, point.y);
    return !!top && (top === node || node.contains(top) || top.contains(node));
  }, center);
  expect(
    receivesHit,
    "primary action is covered by another element at its centre"
  ).toBe(true);
}

// The full-screen editing sheet pads BOTH edges that can fall under the notch /
// home indicator: the header carries a top inset and the footer (or, when there
// is no footer, the scrollable content area) carries a bottom inset. Each is
// checked on its specific element — required edge class AND computed padding, so
// a dropped edge or an inset utility that stops emitting CSS both fail.
async function expectEditingSheetSafeArea(dialog: Locator): Promise<void> {
  const header = dialog.locator("> header");
  await expect(header).toBeVisible();
  expect(
    (await header.getAttribute("class")) ?? "",
    "drawer header must carry a top safe-area inset"
  ).toContain("env(safe-area-inset-top)");
  const headerPadTop = await header.evaluate((el) =>
    parseFloat(getComputedStyle(el as Element).paddingTop)
  );
  expect(
    headerPadTop,
    `drawer header paddingTop ${headerPadTop}px lost its base inset`
  ).toBeGreaterThanOrEqual(18 - SLACK);

  const footer = dialog.locator("> footer");
  const bottomEdge =
    (await footer.count()) > 0
      ? footer
      : dialog.locator("> div.overflow-y-auto");
  await expect(bottomEdge).toBeVisible();
  expect(
    (await bottomEdge.getAttribute("class")) ?? "",
    "drawer bottom edge must carry a bottom safe-area inset"
  ).toContain("env(safe-area-inset-bottom)");
  const bottomPad = await bottomEdge.evaluate((el) =>
    parseFloat(getComputedStyle(el as Element).paddingBottom)
  );
  expect(
    bottomPad,
    `drawer bottom paddingBottom ${bottomPad}px lost its base inset`
  ).toBeGreaterThanOrEqual(14 - SLACK);
}

for (const flow of FLOWS) {
  test.describe(`mobile flow — ${flow.name} (#651)`, () => {
    test.beforeEach(async ({ page }) => {
      // Pin every project to the 375px floor. The WebKit project already opens
      // at 375 via its iPhone descriptor (an isMobile context, where resizing is
      // a no-op), so only the wider Chromium projects need the resize.
      if (page.viewportSize()?.width !== PHONE.width) {
        await page.setViewportSize(PHONE);
      }
    });

    test("primary actions are ≥44px and every control clears 24px", async ({
      page,
    }) => {
      await flow.goto(page);
      await flow.open(page, "click");
      const region = flow.region(page);
      await expectTapTargets(region, flow.primaries(region));
    });

    test("form fields stay ≥16px and primary action text ≥14px", async ({
      page,
    }) => {
      await flow.goto(page);
      await flow.open(page, "click");
      const region = flow.region(page);
      await expectFontFloor(region, flow.primaries(region));
    });

    test("the flow does not overflow horizontally at 375px", async ({
      page,
    }) => {
      await flow.goto(page);
      await flow.open(page, "click");
      await expectNoHorizontalOverflow(flow.region(page));
    });

    test("the primary action is unclipped and unobstructed", async ({
      page,
    }) => {
      await flow.goto(page);
      await flow.open(page, "click");
      const region = flow.region(page);
      for (const primary of flow.primaries(region)) {
        await expectPrimaryUnobstructed(page, primary);
      }
    });

    test("axe finds no critical or serious violations at 375px", async ({
      page,
    }) => {
      await flow.goto(page);
      await flow.open(page, "click");
      // Drawer flows portal the sheet outside the surface, so scan the whole
      // page; the in-page setup flow scans the Home surface to stay fast.
      const builder = flow.isDrawer
        ? new AxeBuilder({ page })
        : new AxeBuilder({ page }).include(HOME);
      expectNoBlockingAxeViolations(await builder.analyze());
    });

    // ---- WebKit (Safari-engine) only ------------------------------------
    test("WebKit: the viewport and fixed sheet honor the safe area", async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== "webkit", "WebKit-engine safe-area check");
      await flow.goto(page);

      const viewportMeta = await page
        .locator('meta[name="viewport"]')
        .getAttribute("content");
      expect(
        viewportMeta ?? "",
        "viewport must opt into viewport-fit=cover for safe-area insets"
      ).toContain("viewport-fit=cover");

      if (!flow.isDrawer) return;
      await flow.open(page, "click");
      await expectEditingSheetSafeArea(flow.region(page));
    });

    test("WebKit: the flow opens and an in-drawer field focuses via touch", async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== "webkit", "WebKit-engine touch check");
      test.skip(!flow.isDrawer, "no drawer touch path for this flow");
      await flow.goto(page);
      await flow.open(page, "tap");
      const region = flow.region(page);
      await expect(region).toBeVisible();

      // Tapping an editable field exercises the in-drawer touch path without
      // tapping a (disabled) submit, which would fail the enabled actionability
      // check.
      const field = region
        .locator('input:not([type="hidden"]), textarea')
        .first();
      await field.tap();
      await expect(field).toBeFocused();
    });
  });
}
