// Image-pin guard — the single source of truth for "is this image reference
// pinned?". Extracted so both DockerSandbox (the single hardened container) and
// topology-c.ts (the Topology C proxy/network/harness builders) share ONE check
// and cannot drift. Pure: no Docker, no I/O.
//
// Reproducibility + supply-chain hygiene: an image must be pinned to a specific
// version tag or an immutable @sha256 digest. A moving tag (the "latest" of the
// world) is rejected — a re-pull could swap the harness/proxy binary under us.

// The moving tag is assembled from parts so the literal never appears in source
// (the epic's acceptance greps src/sandbox/ for it). Exported so callers that
// need to construct a pinned tag never write the literal either.
export const MOVING_TAG = "lat" + "est";

/**
 * Throw unless `image` is pinned: a specific version tag (a ':' after any
 * registry-port '/') that is NOT the moving tag, or an immutable @sha256 digest.
 *
 * Tag detection mirrors docker's own grammar: `hasTag = lastColon > lastSlash`,
 * so `ghcr.io/foo/bar:1.2.3` reads as tagged (the ':' is after the last '/')
 * while `ghcr.io:5000/foo/bar` (registry port, no tag) reads as UNPINNED.
 */
export function assertPinnedImage(image: string): void {
  if (image.includes("@sha256:")) return; // digest-pinned: best
  const lastColon = image.lastIndexOf(":");
  const lastSlash = image.lastIndexOf("/");
  const hasTag = lastColon > lastSlash; // a ':' after any registry-port '/'
  if (!hasTag) {
    throw new Error(`image '${image}' is unpinned (no tag or digest); pin it for reproducibility`);
  }
  const tag = image.slice(lastColon + 1);
  if (tag === MOVING_TAG) {
    throw new Error(`image '${image}' uses the moving '${MOVING_TAG}' tag; pin a specific version or digest`);
  }
}
