// The Super Admin page scrolls under the shell's sticky TopBar (height 56);
// the workspace tab rail sticks just below it. Anchored sections inside a
// workspace use this as scrollMarginTop so an anchor jump clears both bars.
//
// Lives outside the "use client" console module on purpose: the console shell
// is a server component, and importing a non-component value from a client
// module there yields a client reference instead of the number.
export const SUPER_ADMIN_STICKY_ANCHOR_OFFSET = 120;
