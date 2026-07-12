// Keeps E2E live-refresh claims honest: persistence is checked only after the
// current page has rendered the committed mutation. A failed live assertion
// rejects before reload, so a fresh server read can never rescue the contract.
export async function assertLiveThenPersist({
  assertLive,
  reload,
  assertPersisted,
}: {
  assertLive: () => Promise<void>;
  reload: () => Promise<void>;
  assertPersisted: () => Promise<void>;
}): Promise<void> {
  await assertLive();
  await reload();
  await assertPersisted();
}
