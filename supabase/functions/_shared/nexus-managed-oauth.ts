export const managedOAuth = {
  gsc: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    resources: "https://www.googleapis.com/webmasters/v3/sites",
  },
  ga4: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    resources: "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
  },
  bing: {
    authorize: "https://www.bing.com/webmasters/oauth/authorize",
    token: "https://www.bing.com/webmasters/oauth/token",
    scope: "webmaster.read",
    resources: "https://www.bing.com/webmaster/api.svc/json/GetUserSites",
  },
} as const;

export type ManagedProvider = keyof typeof managedOAuth;
type App = { clientId: string; clientSecret: string; redirectUri: string };

export function authorizationUrl(provider: ManagedProvider, app: App, state: string, challenge: string) {
  const config = managedOAuth[provider];
  const url = new URL(config.authorize);
  url.search = new URLSearchParams({
    client_id: app.clientId,
    redirect_uri: app.redirectUri,
    response_type: "code",
    scope: config.scope,
    state,
    ...(provider === "bing" ? {} : {
      access_type: "offline", prompt: "consent", code_challenge: challenge, code_challenge_method: "S256",
    }),
  }).toString();
  return url.href;
}

export async function exchangeOAuth(
  fetcher: typeof fetch,
  provider: ManagedProvider,
  app: App,
  grant: { code: string; verifier: string } | { refreshToken: string },
) {
  const params = new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret });
  if ("code" in grant) {
    params.set("grant_type", "authorization_code");
    params.set("code", grant.code);
    params.set("redirect_uri", app.redirectUri);
    if (provider !== "bing") params.set("code_verifier", grant.verifier);
  } else {
    params.set("grant_type", "refresh_token");
    params.set("refresh_token", grant.refreshToken);
  }
  const response = await fetcher(managedOAuth[provider].token, {
    method: "POST", body: params, redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("oauth_token_exchange_failed");
  const result = await response.json();
  if (typeof result.access_token !== "string" || !result.access_token) throw new Error("oauth_access_token_missing");
  return {
    accessToken: result.access_token as string,
    refreshToken: typeof result.refresh_token === "string" ? result.refresh_token : undefined,
  };
}

export async function listOAuthResources(fetcher: typeof fetch, provider: ManagedProvider, accessToken: string) {
  const url = new URL(managedOAuth[provider].resources);
  const resources = new Map<string, { id: string; label: string }>();
  do {
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("oauth_resource_list_failed");
    const data = await response.json();
    if (provider === "gsc") {
      for (const item of data.siteEntry ?? []) {
        if (typeof item.siteUrl === "string" && ["siteOwner", "siteFullUser", "siteRestrictedUser"].includes(item.permissionLevel)) {
          resources.set(item.siteUrl, { id: item.siteUrl, label: item.siteUrl });
        }
      }
    } else if (provider === "ga4") {
      for (const account of data.accountSummaries ?? []) {
        for (const item of account.propertySummaries ?? []) {
          if (typeof item.property === "string" && /^properties\/\d+$/.test(item.property)) {
            resources.set(item.property, { id: item.property, label: item.displayName || item.property });
          }
        }
      }
      if (typeof data.nextPageToken === "string" && data.nextPageToken && data.nextPageToken !== url.searchParams.get("pageToken")) {
        url.searchParams.set("pageToken", data.nextPageToken);
        continue;
      }
    } else {
      for (const item of data.d ?? []) {
        if (typeof item.Url === "string" && item.IsVerified === true) resources.set(item.Url, { id: item.Url, label: item.Url });
      }
    }
    return [...resources.values()];
  } while (true);
}
