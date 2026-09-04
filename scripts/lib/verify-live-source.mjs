/** @param {string} url @param {"HEAD" | "GET"} method */
async function request(url, method) {
  const response = await fetch(url, {
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: { "user-agent": "solo-venture-scout-release-verifier/1.0" },
  });
  if (method === "GET") await response.body?.cancel();
  return response;
}

/** @param {{ url: string }} source */
export async function verifyLiveSource(source) {
  try {
    let response = await request(source.url, "HEAD");
    if (response.status < 200 || response.status >= 400) {
      response = await request(source.url, "GET");
    }
    return {
      resolved: response.status >= 200 && response.status < 400,
      resolvedUrl: response.url,
      httpStatus: response.status,
    };
  } catch (error) {
    return {
      resolved: false,
      resolvedUrl: source.url,
      httpStatus: 0,
      verificationError: error instanceof Error ? error.message : String(error),
    };
  }
}
