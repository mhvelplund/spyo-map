export interface OAuthProvider {
  id: "google";
  authorizeUrl(a: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string;
  /** Returns the verified email, or null if the code is rejected or the email is not verified. */
  exchangeForVerifiedEmail(
    a: {
      code: string;
      codeVerifier: string;
      redirectUri: string;
      clientId: string;
      clientSecret: string;
    },
    fetchFn: typeof fetch,
  ): Promise<string | null>;
}
