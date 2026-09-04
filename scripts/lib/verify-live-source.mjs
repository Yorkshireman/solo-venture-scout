import { sha256 } from "./artifact-identity.mjs";

/** @param {string} hostname @param {string[]} allowedHosts */
function hostIsAllowed(hostname, allowedHosts) {
  return allowedHosts.some(
    (allowedHost) =>
      hostname === allowedHost || hostname.endsWith(`.${allowedHost}`),
  );
}

/** @param {string} url */
async function request(url) {
  return fetch(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: { "user-agent": "solo-venture-scout-release-verifier/1.0" },
  });
}

/**
 * @param {{ url: string }} source
 * @param {{ allowedHosts: string[], pathPrefix: string, contentMarkers: string[] }} requirement
 */
export async function verifyLiveSource(source, requirement) {
  try {
    const response = await request(source.url);
    const resolvedUrl = new URL(response.url);
    const contents = await response.text();
    const normalizedContents = contents.toLocaleLowerCase("en-US");
    return {
      resolved: response.status >= 200 && response.status < 400,
      resolvedUrl: response.url,
      httpStatus: response.status,
      retrievedAt: new Date().toISOString(),
      contentType: response.headers.get("content-type"),
      contentBytes: Buffer.byteLength(contents),
      contentSha256: sha256(contents),
      hostAllowed: hostIsAllowed(resolvedUrl.hostname, requirement.allowedHosts),
      pathAllowed: resolvedUrl.pathname.startsWith(requirement.pathPrefix),
      contentMarkersMatched: requirement.contentMarkers.every((marker) =>
        normalizedContents.includes(marker.toLocaleLowerCase("en-US")),
      ),
    };
  } catch (error) {
    return {
      resolved: false,
      resolvedUrl: source.url,
      httpStatus: 0,
      retrievedAt: new Date().toISOString(),
      contentType: null,
      contentBytes: 0,
      contentSha256: null,
      hostAllowed: false,
      pathAllowed: false,
      contentMarkersMatched: false,
      verificationError: error instanceof Error ? error.message : String(error),
    };
  }
}
