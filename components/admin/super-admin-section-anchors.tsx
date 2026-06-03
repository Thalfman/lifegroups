"use client";

import { useEffect } from "react";

// Super Admin Console anchor behaviour (#261).
//
// The console's operational sections are native <details> collapsed by default,
// so basic disclosure works with no JS. This controller layers the anchor
// requirement on top: following a section link (from the section rail or a deep
// link) expands the target section, scrolls to it, and moves focus to its
// heading — so keyboard and screen-reader users land inside the section they
// asked for instead of on a collapsed, unfocused region.
export function SuperAdminSectionAnchors() {
  useEffect(() => {
    function openAndFocus(id: string) {
      const el = document.getElementById(id);
      if (!el) return;
      const details =
        el.tagName === "DETAILS"
          ? (el as HTMLDetailsElement)
          : el.querySelector("details");
      if (details) details.open = true;
      el.scrollIntoView({ block: "start" });
      // The <summary> is the section heading and is natively focusable; fall
      // back to the section element so focus still lands somewhere sensible.
      const summary = el.querySelector("summary") as HTMLElement | null;
      (summary ?? (el as HTMLElement)).focus({ preventScroll: true });
    }

    function fromHash() {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (id) openAndFocus(id);
    }

    function onClick(event: MouseEvent) {
      const anchor = (event.target as HTMLElement | null)?.closest(
        'a[href^="#"]'
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const id = decodeURIComponent(anchor.getAttribute("href")!.slice(1));
      if (!id) return;
      // Take over the jump so we expand + focus even when re-clicking the same
      // link (which would not fire `hashchange`).
      event.preventDefault();
      if (window.location.hash !== `#${id}`) {
        window.history.pushState(null, "", `#${id}`);
      }
      openAndFocus(id);
    }

    // Honour a deep link on first paint.
    fromHash();
    window.addEventListener("hashchange", fromHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return null;
}
