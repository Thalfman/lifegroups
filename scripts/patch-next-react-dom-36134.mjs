// Temporary Next.js 16.2.9 runtime shim for React PR #36134.
//
// Next's App Router aliases ReactDOM to its vendored canary, so upgrading the
// top-level react/react-dom packages does not change this client runtime. The
// vendored 2026-03-17 canary predates #36134: when a suspended promise pings
// during the render phase, pingSuspendedRoot can fail to record the pinged lane,
// leaving useActionState/useTransition pending with no rerender (#839).
//
// Remove this entire script, its postinstall hook, tests, and fitness guard when
// Next 16.3.0 (or a verified later stable) is adopted. Next maintainers identify
// 16.3.0 as the release carrying the upstream fix.
//
// This script intentionally fails closed. It accepts one exact Next/runtime
// tuple and one exact vulnerable or patched SHA-256 per client bundle. A Next
// upgrade, repack, partial edit, or unexpected source shape stops installation
// instead of silently applying a best-effort dependency mutation.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SUPPORTED_NEXT_VERSION = "16.2.9";
export const SUPPORTED_BUNDLED_REACT_DOM_VERSION =
  "19.3.0-canary-3f0b9e61-20260317";
export const PATCH_REMOVAL_NEXT_VERSION = "16.3.0";

const PATCH_FRAGMENTS = {
  development: {
    vulnerable: `          ? (executionContext & RenderContext) === NoContext &&
            prepareFreshStack(root, 0)
          : (workInProgressRootPingedLanes |= pingedLanes),`,
    patched: `          ? (executionContext & RenderContext) === NoContext
            ? prepareFreshStack(root, 0)
            : (workInProgressRootPingedLanes |= pingedLanes)
          : (workInProgressRootPingedLanes |= pingedLanes),`,
  },
  production: {
    vulnerable: `      ? 0 === (executionContext & 2) && prepareFreshStack(root, 0)
      : (workInProgressRootPingedLanes |= pingedLanes),`,
    patched: `      ? 0 === (executionContext & 2)
        ? prepareFreshStack(root, 0)
        : (workInProgressRootPingedLanes |= pingedLanes)
      : (workInProgressRootPingedLanes |= pingedLanes),`,
  },
};

export const PATCH_FILES = [
  {
    relativePath: "cjs/react-dom-client.development.js",
    variant: "development",
    vulnerableHash:
      "5166f0026794ec099a8074292644c4b463bed40632c84b7c14ad78f836fda293",
    patchedHash:
      "1e9845e10aaa9ffa7fa65aafa85f17f98885482809f596d22caae41ac3de8c3e",
  },
  {
    relativePath: "cjs/react-dom-client.production.js",
    variant: "production",
    vulnerableHash:
      "f0fce6a185ca88905e72eb887fcd6d605555744363cb921ba44d9eabb36e012e",
    patchedHash:
      "c555b09a73db29c59ea83fa6506dc239f53c24536a89c79011d8db64fc2ab766",
  },
  {
    relativePath: "cjs/react-dom-profiling.development.js",
    variant: "development",
    vulnerableHash:
      "2baaa40494a733907a91fa4852954aee380935ce3a32bcec84d6a47c76f6beaa",
    patchedHash:
      "42df56d4d9007a9c31eb92e056ed08ea7994b51f2c1d4d80678e46e6fe3c2a00",
  },
  {
    relativePath: "cjs/react-dom-profiling.profiling.js",
    variant: "production",
    vulnerableHash:
      "9f80e884a7864bb90b92d4005c2f045e0b1bbb301c269cdce499774072c5ba9f",
    patchedHash:
      "5740aa086715ef3c2d07c3b9493e37f6daec43542a79b4002f15afe140034b67",
  },
];

function occurrenceCount(source, fragment) {
  return source.split(fragment).length - 1;
}

export function hashSource(source) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function patchSource(source, variant) {
  const fragments = PATCH_FRAGMENTS[variant];
  if (!fragments) throw new Error(`Unknown #36134 patch variant: ${variant}`);

  const vulnerableCount = occurrenceCount(source, fragments.vulnerable);
  const patchedCount = occurrenceCount(source, fragments.patched);

  if (vulnerableCount === 1 && patchedCount === 0) {
    return {
      state: "patched",
      source: source.replace(fragments.vulnerable, fragments.patched),
    };
  }
  if (vulnerableCount === 0 && patchedCount === 1) {
    return { state: "already-patched", source };
  }

  throw new Error(
    `Expected exactly one vulnerable or patched fragment for ${variant} (#36134); ` +
      `found vulnerable=${vulnerableCount}, patched=${patchedCount}.`
  );
}

function planGuardedFile({ filePath, variant, vulnerableHash, patchedHash }) {
  const source = readFileSync(filePath, "utf8");
  const actualHash = hashSource(source);

  if (actualHash !== vulnerableHash && actualHash !== patchedHash) {
    throw new Error(
      `ReactDOM #36134 hash drift in ${filePath}: expected vulnerable ` +
        `${vulnerableHash} or patched ${patchedHash}, received ${actualHash}. ` +
        `Do not bypass this guard; verify the installed Next runtime and ` +
        `remove or deliberately update the temporary shim.`
    );
  }

  const result = patchSource(source, variant);
  const resultHash = hashSource(result.source);
  if (resultHash !== patchedHash) {
    throw new Error(
      `ReactDOM #36134 patched hash mismatch in ${filePath}: expected ` +
        `${patchedHash}, received ${resultHash}.`
    );
  }

  return result;
}

export function patchGuardedFile(spec) {
  const result = planGuardedFile(spec);
  if (result.state === "patched") {
    writeFileSync(spec.filePath, result.source, "utf8");
  }
  return result.state;
}

export function validateRuntime({ nextVersion, bundledReactDomVersion }) {
  if (nextVersion !== SUPPORTED_NEXT_VERSION) {
    throw new Error(
      `Unsupported Next version for temporary ReactDOM #36134 shim: ` +
        `${nextVersion}; expected ${SUPPORTED_NEXT_VERSION}. If upgrading to ` +
        `Next >= ${PATCH_REMOVAL_NEXT_VERSION}, remove the shim and its guards.`
    );
  }
  if (bundledReactDomVersion !== SUPPORTED_BUNDLED_REACT_DOM_VERSION) {
    throw new Error(
      `Unexpected bundled ReactDOM for temporary #36134 shim: ` +
        `${bundledReactDomVersion}; expected ` +
        `${SUPPORTED_BUNDLED_REACT_DOM_VERSION}.`
    );
  }
}

function bundledReactDomVersion(reactDomRoot) {
  const source = readFileSync(
    path.join(reactDomRoot, "cjs", "react-dom.production.js"),
    "utf8"
  );
  const match = source.match(/exports\.version\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Could not read Next's bundled ReactDOM version.");
  }
  return match[1];
}

export function patchVendoredReactDom({ repoRoot }) {
  const nextRoot = path.join(repoRoot, "node_modules", "next");
  const nextPackage = JSON.parse(
    readFileSync(path.join(nextRoot, "package.json"), "utf8")
  );
  const reactDomRoot = path.join(nextRoot, "dist", "compiled", "react-dom");

  validateRuntime({
    nextVersion: nextPackage.version,
    bundledReactDomVersion: bundledReactDomVersion(reactDomRoot),
  });

  // Preflight every bundle before writing any of them, preventing a known
  // mismatch in a later file from leaving a newly installed runtime half-patched.
  const plans = PATCH_FILES.map((spec) => {
    const filePath = path.join(reactDomRoot, spec.relativePath);
    return {
      filePath,
      result: planGuardedFile({ ...spec, filePath }),
    };
  });

  for (const plan of plans) {
    if (plan.result.state === "patched") {
      writeFileSync(plan.filePath, plan.result.source, "utf8");
    }
  }

  return plans.map((plan) => ({
    filePath: plan.filePath,
    state: plan.result.state,
  }));
}

export function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const results = patchVendoredReactDom({
    repoRoot: path.resolve(scriptDir, ".."),
  });
  const patched = results.filter((result) => result.state === "patched").length;
  console.log(
    `[postinstall] ReactDOM #36134 shim verified: ${patched} patched, ` +
      `${results.length - patched} already patched. Remove at Next ` +
      `${PATCH_REMOVAL_NEXT_VERSION}+.`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
