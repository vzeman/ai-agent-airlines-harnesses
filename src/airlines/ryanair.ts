import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { cookieHeader, FlareSolverrClient } from "../core/flaresolverr.js";
import { ManualInterventionRequired } from "../core/errors.js";
import { config } from "../core/config.js";
import type { BrowserContext, Cookie, FrameLocator, Locator, Page } from "playwright-core";
import { chromium } from "playwright-core";
import type {
  AirlineAdapter,
  BookingListInput,
  BookingListResult,
  BookingSummary,
  BrowserCookie,
  FlightOption,
  FlightSearchInput,
  HarnessSession,
  LoginInput,
  LoginResult,
  ScreenshotArtifact,
  VerificationCodeInput
} from "../core/types.js";

const DEFAULT_LOCALE = "en-gb";
const RYANAIR_SITE_LOCALE = "gb/en";
const EMAIL_SELECTOR = "input[type='email'], input[name='email'], input[autocomplete='username'], input[formcontrolname*='email' i]";
const PASSWORD_SELECTOR =
  "input[type='password'], input[name='password'], input[autocomplete='current-password'], input[formcontrolname*='password' i]";
type PendingChallengeTask =
  | { kind: "login"; includeScreenshot: boolean }
  | { kind: "listBookings"; locale: string; activeOnly: boolean; includeScreenshot: boolean };

interface PendingVerificationChallenge {
  id: string;
  context: BrowserContext;
  page: Page;
  task: PendingChallengeTask;
  expiresAt: number;
  timeout: NodeJS.Timeout;
}

const pendingVerificationChallenges = new Map<string, PendingVerificationChallenge>();

export class RyanairAdapter implements AirlineAdapter {
  code = "ryanair" as const;
  baseUrl = "https://www.ryanair.com";

  constructor(private readonly flaresolverr = new FlareSolverrClient()) {}

  async resolveSession(sessionId: string): Promise<HarnessSession> {
    const solution = await this.flaresolverr.get({
      url: `${this.baseUrl}/${DEFAULT_LOCALE}`,
      session: sessionId,
      returnOnlyCookies: true
    });

    return {
      id: sessionId,
      airline: this.code,
      baseUrl: this.baseUrl,
      userAgent: solution.userAgent,
      cookies: solution.cookies ?? []
    };
  }

  async findFlights(input: FlightSearchInput, session: HarnessSession): Promise<FlightOption[]> {
    const fares = await this.findFareFinderFlights(input, session);
    if (fares) return fares;
    return this.findAvailabilityFlights(input, session);
  }

  async login(input: LoginInput, session: HarnessSession): Promise<LoginResult> {
    if (!config.browserWsEndpoint) {
      throw new ManualInterventionRequired("Ryanair login requires BROWSER_WS_ENDPOINT.", {
        airline: this.code
      });
    }

    const siteLocale = input.locale ?? RYANAIR_SITE_LOCALE;
    const browser = await chromium.connect(config.browserWsEndpoint, { timeout: 20_000 });
    const context = await browser.newContext({
      userAgent: session.userAgent,
      locale: browserLocale(input.locale),
      viewport: { width: 1440, height: 1100 },
      ignoreHTTPSErrors: true
    });
    let keepContextOpen = false;

    try {
      await context.addCookies(toPlaywrightCookies(session.cookies, this.baseUrl));
      const page = await context.newPage();
      await page.goto(`${this.baseUrl}/${siteLocale}`, {
        waitUntil: "domcontentloaded",
        timeout: config.renderedFlowTimeoutMs
      });
      await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
      await page.waitForTimeout(2_000);
      await dismissCookieBanners(page);
      await openLoginPanel(page);
      await fillLoginForm(page, input.username, input.password);
      const outcome = await submitLoginForm(page);
      if (input.verificationCode) await submitVerificationCode(page, input.verificationCode);
      const cookies = await context.cookies();
      const authState = await authenticationState(page, outcome === "submitted");
      const challenge =
        !input.verificationCode && authState.diagnostics.reason === "verification_required"
          ? registerVerificationChallenge(context, page, { kind: "login", includeScreenshot: input.includeScreenshot ?? false })
          : undefined;
      keepContextOpen = Boolean(challenge);
      const screenshot = input.includeScreenshot && !challenge ? await captureAccountScreenshot(page, "Ryanair login result", true) : undefined;

      return {
        airline: this.code,
        authenticated: authState.authenticated,
        url: page.url(),
        accountLabel: authState.accountLabel,
        cookieCount: cookies.length,
        screenshot,
        diagnostics: challenge ? withChallengeDiagnostics(authState.diagnostics, challenge) : authState.diagnostics
      };
    } finally {
      if (!keepContextOpen) await context.close();
    }
  }

  async listBookings(input: BookingListInput, session: HarnessSession): Promise<BookingListResult> {
    if (!config.browserWsEndpoint) {
      throw new ManualInterventionRequired("Ryanair booking list requires BROWSER_WS_ENDPOINT.", {
        airline: this.code
      });
    }

    const siteLocale = input.locale ?? RYANAIR_SITE_LOCALE;
    const browser = await chromium.connect(config.browserWsEndpoint, { timeout: 20_000 });
    const context = await browser.newContext({
      userAgent: session.userAgent,
      locale: browserLocale(input.locale),
      viewport: { width: 1440, height: 1100 },
      ignoreHTTPSErrors: true
    });
    let keepContextOpen = false;

    try {
      await context.addCookies(toPlaywrightCookies(session.cookies, this.baseUrl));
      const page = await context.newPage();
      await page.goto(`${this.baseUrl}/${siteLocale}`, {
        waitUntil: "domcontentloaded",
        timeout: config.renderedFlowTimeoutMs
      });
      await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
      await page.waitForTimeout(2_000);
      await dismissCookieBanners(page);
      await openLoginPanel(page);
      await fillLoginForm(page, input.username, input.password);
      const outcome = await submitLoginForm(page);
      if (input.verificationCode) await submitVerificationCode(page, input.verificationCode);
      const authState = await authenticationState(page, outcome === "submitted");

      if (!authState.authenticated) {
        const cookies = await context.cookies();
        const screenshot = input.includeScreenshot ? await captureBookingScreenshot(page, "Login blocker for Ryanair booking list", true) : undefined;
        const challenge =
          !input.verificationCode && authState.diagnostics.reason === "verification_required"
            ? registerVerificationChallenge(context, page, {
                kind: "listBookings",
                locale: siteLocale,
                activeOnly: input.activeOnly ?? true,
                includeScreenshot: input.includeScreenshot ?? false
              })
            : undefined;
        keepContextOpen = Boolean(challenge);
        return {
          airline: this.code,
          authenticated: false,
          url: page.url(),
          count: 0,
          bookings: [],
          cookieCount: cookies.length,
          screenshot,
          diagnostics: {
            ...authState.diagnostics,
            ...(challenge ? withChallengeDiagnostics({}, challenge) : {}),
            bookingListLoaded: false
          }
        };
      }

      await openMyBookings(page, siteLocale);
      const bookingTexts = await extractBookingTexts(page);
      const bookings = bookingTexts.map((text) => parseRyanairBookingText(text)).filter((booking) => (input.activeOnly ?? true) ? !isPastBooking(booking) : true);
      const cookies = await context.cookies();
      const screenshot = input.includeScreenshot ? await captureBookingScreenshot(page, "Ryanair active bookings page", false) : undefined;
      const bodyText = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");

      return {
        airline: this.code,
        authenticated: true,
        url: page.url(),
        count: bookings.length,
        bookings,
        cookieCount: cookies.length,
        screenshot,
        diagnostics: {
          ...authState.diagnostics,
          bookingListLoaded: true,
          extractedTextBlocks: bookingTexts.length,
          ...(bookingTexts.length === 0 ? { bookingListState: bookingListState(page.url(), bodyText) } : {})
        }
      };
    } finally {
      if (!keepContextOpen) await context.close();
    }
  }

  async submitVerificationCode(input: VerificationCodeInput): Promise<LoginResult | BookingListResult> {
    const challenge = takeVerificationChallenge(input.challengeId);
    if (!challenge) {
      throw new ManualInterventionRequired("Ryanair verification challenge was not found or has expired.", {
        airline: this.code,
        challengeId: input.challengeId,
        reason: "challenge_not_found_or_expired"
      });
    }

    const { context, page, task } = challenge;
    try {
      await submitVerificationCode(page, input.verificationCode);
      const authState = await authenticationState(page, true);
      const cookies = await context.cookies();

      if (task.kind === "login") {
        const screenshot = task.includeScreenshot ? await captureAccountScreenshot(page, "Ryanair successful login proof", true) : undefined;
        return {
          airline: this.code,
          authenticated: authState.authenticated,
          url: page.url(),
          accountLabel: authState.accountLabel,
          cookieCount: cookies.length,
          screenshot,
          diagnostics: {
            ...authState.diagnostics,
            challengeResumed: true
          }
        };
      }

      if (!authState.authenticated) {
        const screenshot = task.includeScreenshot ? await captureBookingScreenshot(page, "Login blocker for Ryanair booking list", true) : undefined;
        return {
          airline: this.code,
          authenticated: false,
          url: page.url(),
          count: 0,
          bookings: [],
          cookieCount: cookies.length,
          screenshot,
          diagnostics: {
            ...authState.diagnostics,
            challengeResumed: true,
            bookingListLoaded: false
          }
        };
      }

      await openMyBookings(page, task.locale);
      const bookingTexts = await extractBookingTexts(page);
      const bookings = bookingTexts.map((text) => parseRyanairBookingText(text)).filter((booking) => (task.activeOnly ? !isPastBooking(booking) : true));
      const screenshot = task.includeScreenshot ? await captureBookingScreenshot(page, "Ryanair active bookings page", false) : undefined;
      const bodyText = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");

      return {
        airline: this.code,
        authenticated: true,
        url: page.url(),
        count: bookings.length,
        bookings,
        cookieCount: cookies.length,
        screenshot,
        diagnostics: {
          ...authState.diagnostics,
          challengeResumed: true,
          bookingListLoaded: true,
          extractedTextBlocks: bookingTexts.length,
          ...(bookingTexts.length === 0 ? { bookingListState: bookingListState(page.url(), bodyText) } : {})
        }
      };
    } finally {
      await context.close();
    }
  }

  async cancelVerificationChallenge(challengeId: string): Promise<boolean> {
    const challenge = takeVerificationChallenge(challengeId);
    if (!challenge) return false;
    await challenge.context.close();
    return true;
  }

  private async findFareFinderFlights(input: FlightSearchInput, session: HarnessSession): Promise<FlightOption[] | null> {
    const month = `${input.dateOut.slice(0, 7)}-01`;
    const currency = input.currency ?? "EUR";
    const url = `${this.baseUrl}/api/farfnd/v4/oneWayFares/${input.origin.toUpperCase()}/${input.destination.toUpperCase()}/cheapestPerDay?${new URLSearchParams({
      outboundMonthOfDate: month,
      currency
    }).toString()}`;

    const response = await fetch(url, {
      headers: this.headers(session, input.locale ?? DEFAULT_LOCALE)
    });
    if (!response.ok) return null;

    const data = await response.json();
    return parseRyanairFareFinder(data, input);
  }

  private async findAvailabilityFlights(input: FlightSearchInput, session: HarnessSession): Promise<FlightOption[]> {
    const locale = input.locale ?? DEFAULT_LOCALE;
    const params = new URLSearchParams({
      ADT: String(input.adults ?? 1),
      TEEN: String(input.teens ?? 0),
      CHD: String(input.children ?? 0),
      INF: String(input.infants ?? 0),
      Origin: input.origin.toUpperCase(),
      Destination: input.destination.toUpperCase(),
      DateOut: input.dateOut,
      DateIn: input.dateIn ?? "",
      Disc: "0",
      promoCode: "",
      IncludeConnectingFlights: "false",
      FlexDaysBeforeOut: String(input.flexDaysBeforeOut ?? 3),
      FlexDaysOut: String(input.flexDaysOut ?? 3),
      FlexDaysBeforeIn: "3",
      FlexDaysIn: "3",
      RoundTrip: String(Boolean(input.dateIn)),
      ToUs: "AGREED",
      exists: "false"
    });
    if (input.currency) params.set("currency", input.currency);

    const url = `${this.baseUrl}/api/booking/v4/${locale}/availability?${params.toString()}`;
    const response = await fetch(url, {
      headers: this.headers(session, locale)
    });

    if (response.ok) {
      const data = await response.json();
      return parseRyanairAvailability(data, input);
    }

    const declinedText = await response.text();
    const solution = await this.flaresolverr.get({
      url,
      session: session.id,
      waitInSeconds: 1,
      disableMedia: true
    });
    if (solution.status < 200 || solution.status >= 300 || !solution.response) {
      throw new Error(
        `Ryanair availability HTTP ${response.status}: ${declinedText.slice(0, 200)}; browser fallback HTTP ${solution.status}`
      );
    }

    const data = JSON.parse(solution.response);
    return parseRyanairAvailability(data, input);
  }

  private headers(session: HarnessSession, locale: string): Record<string, string> {
    return {
      accept: "application/json, text/plain, */*",
      "accept-language": locale.replace("-", "_"),
      cookie: cookieHeader(session.cookies, "ryanair.com"),
      referer: `${this.baseUrl}/${locale}`,
      "user-agent": session.userAgent ?? "Mozilla/5.0"
    };
  }
}

async function openLoginPanel(page: Page): Promise<void> {
  const selectors = [
    "button:has-text('Log in')",
    "a:has-text('Log in')",
    "button:has-text('Login')",
    "a:has-text('Login')",
    "button:has-text('myRyanair')",
    "a:has-text('myRyanair')",
    "[data-ref*='login']",
    "[data-testid*='login']"
  ];

  for (const selector of selectors) {
    if (await clickIfVisible(page, selector, 2_000)) {
      await page.waitForTimeout(1_500);
      if (await hasEmailField(page)) return;
    }
  }

  if (await hasEmailField(page)) return;
  throw new ManualInterventionRequired("Ryanair login form was not reachable from the homepage.", {
    airline: "ryanair",
    currentUrl: page.url(),
    ...(await loginPageDiagnostics(page))
  });
}

async function fillLoginForm(page: Page, username: string, password: string): Promise<void> {
  const email = await emailField(page);
  if ((await email.count()) === 0) {
    throw new ManualInterventionRequired("Ryanair email field was not found.", {
      airline: "ryanair",
      currentUrl: page.url()
    });
  }

  await email.click({ timeout: 5_000 });
  await email.fill(username, { timeout: 5_000 });

  let passwordField = await passwordInput(page);
  if (!(await passwordField.isVisible({ timeout: 1_000 }).catch(() => false))) {
    await advanceEmailStep(page);
    passwordField = await passwordInput(page);
  }

  if (!(await passwordField.isVisible({ timeout: 8_000 }).catch(() => false))) {
    throw new ManualInterventionRequired("Ryanair password step was not reachable after email entry.", {
      airline: "ryanair",
      currentUrl: page.url()
    });
  }

  await passwordField.click({ timeout: 5_000 });
  await passwordField.fill(password, { timeout: 5_000 });
}

async function advanceEmailStep(page: Page): Promise<void> {
  await page.keyboard.press("Enter");
  if (await (await passwordInput(page)).isVisible({ timeout: 3_000 }).catch(() => false)) return;

  const selectors = [
    "button[type='submit']",
    "button:has-text('Continue')",
    "button:has-text('Next')",
    "button:has-text('Log in')",
    "button:has-text('Login')",
    "[data-ref*='login'] button"
  ];

  const frame = authFrame(page);
  for (const selector of selectors) {
    if (await clickIfVisible(frame, selector, 3_000)) {
      if (await (await passwordInput(page)).isVisible({ timeout: 5_000 }).catch(() => false)) return;
    }
    if (await clickIfVisible(page, selector, 3_000)) {
      if (await (await passwordInput(page)).isVisible({ timeout: 5_000 }).catch(() => false)) return;
    }
  }
}

async function submitLoginForm(page: Page): Promise<"submitted"> {
  const selectors = [
    "button[type='submit']",
    "button:has-text('Log in')",
    "button:has-text('Login')",
    "button:has-text('Sign in')",
    "[data-ref*='login'] button"
  ];

  const frame = authFrame(page);
  for (const selector of selectors) {
    if (await clickIfVisible(frame, selector, 5_000)) {
      await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
      await page.waitForTimeout(4_000);
      return "submitted";
    }
    if (await clickIfVisible(page, selector, 5_000)) {
      await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
      await page.waitForTimeout(4_000);
      return "submitted";
    }
  }

  await page.keyboard.press("Enter");
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
  await page.waitForTimeout(4_000);
  return "submitted";
}

async function submitVerificationCode(page: Page, verificationCode: string): Promise<void> {
  if (!(await verificationRequired(page))) return;

  const frame = authFrame(page);
  const selectors = [
    "input[autocomplete='one-time-code']",
    "input[name*='code' i]",
    "input[placeholder*='code' i]",
    "input[type='text']",
    "input[type='tel']"
  ];

  for (const selector of selectors) {
    const field = frame.locator(selector).first();
    if (!(await field.isVisible({ timeout: 2_000 }).catch(() => false))) continue;
    await field.click({ timeout: 5_000 });
    await field.fill(verificationCode, { timeout: 5_000 });
    break;
  }

  const buttons = ["button[type='submit']", "button:has-text('Continue')", "button:has-text('Verify')", "button:has-text('Submit')"];
  for (const selector of buttons) {
    if (await clickIfVisible(frame, selector, 5_000)) {
      await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
      await page.waitForTimeout(5_000);
      return;
    }
  }

  await page.keyboard.press("Enter");
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
  await page.waitForTimeout(5_000);
}

async function verificationRequired(page: Page): Promise<boolean> {
  const frameText = await authFrame(page).locator("body").innerText({ timeout: 3_000 }).catch(() => "");
  return /verification code|register this device|8-digit|code expired/i.test(frameText);
}

async function hasEmailField(page: Page): Promise<boolean> {
  return (await (await emailField(page)).count().catch(() => 0)) > 0;
}

async function emailField(page: Page): Promise<Locator> {
  return loginField(page, EMAIL_SELECTOR);
}

async function passwordInput(page: Page): Promise<Locator> {
  return loginField(page, PASSWORD_SELECTOR);
}

async function loginField(page: Page, selector: string): Promise<Locator> {
  const frameField = authFrame(page).locator(selector).first();
  if ((await frameField.count().catch(() => 0)) > 0) return frameField;
  return page.locator(selector).first();
}

function authFrame(page: Page): FrameLocator {
  return page.frameLocator("iframe[data-ref='kyc-iframe'], iframe.kyc-iframe");
}

async function loginPageDiagnostics(page: Page): Promise<Record<string, unknown>> {
  return page
    .evaluate(() => {
      const cookieOverlay = document.querySelector("#cookie-popup-with-overlay");
      const visibleButtons = Array.from(document.querySelectorAll("button, a"))
        .map((element) => ({
          text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
          tag: element.tagName.toLowerCase(),
          dataRef: element.getAttribute("data-ref"),
          visible: Boolean(element instanceof HTMLElement && (element.offsetWidth || element.offsetHeight || element.getClientRects().length))
        }))
        .filter((element) => element.visible && /(log|cookie|agree|accept|myryanair)/i.test(`${element.text} ${element.dataRef ?? ""}`))
        .slice(0, 20);

      return {
        cookieOverlayVisible: Boolean(
          cookieOverlay instanceof HTMLElement && (cookieOverlay.offsetWidth || cookieOverlay.offsetHeight || cookieOverlay.getClientRects().length)
        ),
        loginEmailInputCount: document.querySelectorAll(
          "input[type='email'], input[name='email'], input[autocomplete='username'], input[formcontrolname*='email' i]"
        ).length,
        visibleButtons
      };
    })
    .catch(() => ({}));
}

async function dismissCookieBanners(page: Page): Promise<void> {
  const selectors = [
    "button[data-ref='cookie.accept-all']",
    "button[data-testid='cookie-accept-all']",
    "button:has-text('Yes, I agree')",
    "button:has-text('Accept all')",
    "button:has-text('Accept cookies')",
    "button:has-text('Allow all')",
    "button:has-text('I agree')",
    "button:has-text('Agree')"
  ];
  for (const selector of selectors) {
    if (await clickIfVisible(page, selector, 5_000)) {
      await page.locator("#cookie-popup-with-overlay").waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
      await page.waitForTimeout(500);
      return;
    }
  }
}

async function clickIfVisible(scope: Page | FrameLocator, selector: string, timeout: number): Promise<boolean> {
  try {
    const locator = scope.locator(selector);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (!(await candidate.isVisible({ timeout: Math.min(timeout, 1_000) }).catch(() => false))) continue;
      await candidate.scrollIntoViewIfNeeded({ timeout: Math.min(timeout, 2_000) }).catch(() => undefined);
      await candidate.click({ timeout }).catch(async () => {
        await candidate.click({ timeout, force: true });
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function looksAuthenticated(text: string): boolean {
  return /(log out|logout|myryanair|my ryanair|account|profile|wallet|trips)/i.test(text) && !/invalid password|incorrect|try again/i.test(text);
}

function accountLabel(text: string): string | undefined {
  const match = text.match(/\b(myRyanair|My Ryanair|Account|Profile|Wallet|Trips)\b/);
  return match?.[0];
}

function loginFailureReason(text: string): string {
  if (/verification code|register this device|8-digit|code expired/i.test(text) && /invalid|incorrect|wrong|try again|not match|failed|attempts left/i.test(text)) {
    return "verification_code_rejected";
  }
  if (/invalid|incorrect|wrong|try again|not match|failed|attempts left/i.test(text)) return "login_rejected_or_form_error";
  if (/verify|verification|security|captcha|challenge|verification code|register this device|8-digit/i.test(text)) return "verification_required";
  return "authenticated_indicator_not_found";
}

async function authenticationState(
  page: Page,
  loginSubmitted: boolean
): Promise<{ authenticated: boolean; accountLabel?: string; diagnostics: Record<string, unknown> }> {
  const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  const frameText = await authFrame(page).locator("body").innerText({ timeout: 3_000 }).catch(() => "");
  const authFrameVisible = await authFrame(page)
    .locator("body")
    .isVisible({ timeout: 1_000 })
    .catch(() => false);
  const reason = authFrameVisible ? loginFailureReason(frameText) : loginFailureReasonWithoutVerification(bodyText);
  const authenticated = loginSubmitted && reason === "authenticated_indicator_not_found" && !authFrameVisible && looksAuthenticated(bodyText);

  return {
    authenticated,
    accountLabel: authenticated ? accountLabel(bodyText) : undefined,
    diagnostics: {
      loginSubmitted,
      reason: authenticated ? "authenticated_indicator_found" : reason,
      authFrameVisible,
      ...(reason === "verification_required"
        ? { nextAction: "read_email_verification_code_and_retry_with_verificationCode" }
        : {}),
      ...(reason === "verification_code_rejected" ? { nextAction: "read_fresh_email_verification_code_and_retry" } : {})
    }
  };
}

function loginFailureReasonWithoutVerification(text: string): string {
  if (/invalid|incorrect|wrong|try again|not match|failed|attempts left/i.test(text)) return "login_rejected_or_form_error";
  return "authenticated_indicator_not_found";
}

function registerVerificationChallenge(
  context: BrowserContext,
  page: Page,
  task: PendingChallengeTask
): Pick<PendingVerificationChallenge, "id" | "expiresAt"> {
  cleanupExpiredVerificationChallenges();
  const id = `ryanair-verification-${randomUUID()}`;
  const ttlMs = config.ryanairVerificationChallengeTtlMinutes * 60 * 1000;
  const expiresAt = Date.now() + ttlMs;
  const timeout = setTimeout(() => {
    const challenge = pendingVerificationChallenges.get(id);
    pendingVerificationChallenges.delete(id);
    void challenge?.context.close().catch(() => undefined);
  }, ttlMs);
  pendingVerificationChallenges.set(id, { id, context, page, task, expiresAt, timeout });
  return { id, expiresAt };
}

function takeVerificationChallenge(id: string): PendingVerificationChallenge | undefined {
  cleanupExpiredVerificationChallenges();
  const challenge = pendingVerificationChallenges.get(id);
  if (!challenge) return undefined;
  pendingVerificationChallenges.delete(id);
  clearTimeout(challenge.timeout);
  return challenge;
}

function cleanupExpiredVerificationChallenges(): void {
  const now = Date.now();
  for (const [id, challenge] of pendingVerificationChallenges.entries()) {
    if (challenge.expiresAt > now) continue;
    pendingVerificationChallenges.delete(id);
    clearTimeout(challenge.timeout);
    void challenge.context.close().catch(() => undefined);
  }
}

function withChallengeDiagnostics(
  diagnostics: Record<string, unknown>,
  challenge: Pick<PendingVerificationChallenge, "id" | "expiresAt">
): Record<string, unknown> {
  return {
    ...diagnostics,
    challengeId: challenge.id,
    challengeExpiresAt: new Date(challenge.expiresAt).toISOString(),
    challengeTtlMinutes: config.ryanairVerificationChallengeTtlMinutes,
    nextAction: "read_email_verification_code_then_call_submit_verification_code"
  };
}

async function openMyBookings(page: Page, locale: string): Promise<void> {
  const selectors = [
    "button[data-ref='main-links__my_bookings']",
    "[data-ref='main-links__my_bookings']",
    "a:has-text('Trips')",
    "button:has-text('Trips')",
    "[data-ref*='my-booking']",
    "[data-testid*='my-booking']"
  ];

  for (const selector of selectors) {
    if (await clickIfVisible(page, selector, 5_000)) {
      await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
      await page.waitForTimeout(3_000);
      if (await isMyBookingsPage(page)) return;
    }
  }

  await page.goto(`https://www.ryanair.com/${locale}/lp/check-in`, {
    waitUntil: "domcontentloaded",
    timeout: config.renderedFlowTimeoutMs
  });
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
  await page.waitForTimeout(3_000);
  if (await isMyBookingsPage(page)) return;

  throw new ManualInterventionRequired("Ryanair My Bookings page did not load after authentication.", {
    airline: "ryanair",
    currentUrl: page.url(),
    reason: "my_bookings_not_loaded"
  });
}

async function extractBookingTexts(page: Page): Promise<string[]> {
  const selectors = [
    "[data-ref*='booking']",
    "[data-testid*='booking']",
    "[class*='booking']",
    "[class*='trip-card']",
    "[class*='reservation']",
    "ry-trip-card",
    "trip-card"
  ];
  const texts = new Set<string>();

  for (const selector of selectors) {
    const values = await page
      .locator(selector)
      .evaluateAll((elements) =>
        elements
          .map((element) => (element.textContent ?? "").trim().replace(/\s+/g, " "))
          .filter((text) => text.length >= 20 && text.length <= 2_000)
      )
      .catch(() => []);
    for (const value of values) {
      if (!/booking|reservation|trip|flight|depart|return|confirmed|upcoming/i.test(value)) continue;
      if (/retrieve your booking|use booking reservation number|booking reservation number|reservation number|didn.t book directly|email address/i.test(value)) continue;
      if (/cookie|privacy|newsletter|subscribe/i.test(value)) continue;
      texts.add(value);
    }
  }

  if (texts.size > 0) return [...texts].slice(0, 30);

  const body = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  const normalized = body.trim().replace(/\s+/g, " ");
  if (/no upcoming|no active|no bookings|you have no/i.test(normalized)) return [];
  return [];
}

function bookingListState(url: string, text: string): string {
  if (/retrieve your booking|use booking reservation number/i.test(text)) return "retrieve_booking_form";
  if (/no upcoming|no active|no bookings|you have no/i.test(text)) return "empty";
  if (/check-in|managehub/i.test(url)) return "loaded_without_booking_cards";
  return "unknown";
}

export function parseRyanairBookingText(text: string): BookingSummary {
  const normalized = text.trim().replace(/\s+/g, " ");
  const routeMatch = normalized.match(/\b([A-Z]{3})\b\s*(?:to|-|→)\s*\b([A-Z]{3})\b/i);
  const referenceMatch = normalized.match(/\b(?:booking|reservation)\s*(?:reference|ref|number)?\s*[:#]?\s*([A-Z0-9]{6,8})\b/i);
  const dates = [...normalized.matchAll(/\b(20\d{2}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\s+20\d{2})\b/g)].map((match) => match[1]);
  const statusMatch = normalized.match(/\b(confirmed|upcoming|checked in|cancelled|completed|past|active)\b/i);

  return {
    airline: "ryanair",
    bookingReference: referenceMatch?.[1],
    origin: routeMatch?.[1]?.toUpperCase(),
    destination: routeMatch?.[2]?.toUpperCase(),
    departureDate: dates[0],
    returnDate: dates[1],
    status: statusMatch?.[1],
    rawText: normalized
  };
}

async function isMyBookingsPage(page: Page): Promise<boolean> {
  const text = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
  if (/\b404\b|page is off sightseeing|we're sorry/i.test(text)) return false;
  if (/my-bookings|mybooking|trips|check-in/i.test(page.url()) && /my bookings|booking reference|check.?in|your trip|upcoming/i.test(text)) return true;
  const heading = page
    .getByRole("heading", { name: /^(my bookings|my trips|upcoming trips|your bookings|check-in)$/i })
    .first();
  return heading.isVisible({ timeout: 1_000 }).catch(() => false);
}

function isPastBooking(booking: BookingSummary): boolean {
  return /past|completed|cancelled/i.test(booking.status ?? booking.rawText);
}

async function captureBookingScreenshot(page: Page, description: string, maskAuthFrame: boolean): Promise<ScreenshotArtifact> {
  return captureAccountScreenshot(page, description, maskAuthFrame);
}

async function captureAccountScreenshot(page: Page, description: string, maskAuthFrame: boolean): Promise<ScreenshotArtifact> {
  const relativeDir = path.join("artifacts", "screenshots");
  const dir = path.resolve(relativeDir);
  await mkdir(dir, { recursive: true });
  const fileName = ["ryanair", "account", new Date().toISOString().replace(/[:.]/g, "-")].join("_");
  const relativePath = path.join(relativeDir, `${fileName}.png`);
  const filePath = path.resolve(relativePath);
  const mask = maskAuthFrame ? [authFrame(page).locator("body")] : [];

  await page.screenshot({ path: filePath, fullPage: true, mask });

  return {
    path: relativePath,
    url: page.url(),
    capturedAt: new Date().toISOString(),
    description
  };
}

function toPlaywrightCookies(cookies: BrowserCookie[], url: string): Cookie[] {
  const target = new URL(url);
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain ?? target.hostname,
    path: cookie.path ?? "/",
    expires: cookie.expires && cookie.expires > 0 ? cookie.expires : -1,
    httpOnly: cookie.httpOnly ?? false,
    secure: cookie.secure ?? target.protocol === "https:",
    sameSite: sameSite(cookie.sameSite) ?? "Lax"
  }));
}

function sameSite(value?: string): "Strict" | "Lax" | "None" | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "strict") return "Strict";
  if (normalized === "none" || normalized === "no_restriction") return "None";
  return "Lax";
}

function browserLocale(value?: string): string {
  if (!value || value.includes("/")) return "en-GB";
  return value;
}

export function parseRyanairFareFinder(data: unknown, input: FlightSearchInput): FlightOption[] {
  const fares = asArray(read(data, ["outbound", "fares"]));
  const wantedDays = dayWindow(input.dateOut, input.flexDaysBeforeOut ?? 0, input.flexDaysOut ?? 0);
  const flights: FlightOption[] = [];

  for (const fare of fares) {
    const day = stringOrUndefined(read(fare, ["day"]));
    if (!day || !wantedDays.has(day)) continue;
    if (read(fare, ["unavailable"]) === true || read(fare, ["soldOut"]) === true) continue;

    const price = read(fare, ["price"]);
    flights.push({
      airline: "ryanair",
      origin: input.origin.toUpperCase(),
      destination: input.destination.toUpperCase(),
      departure: stringOrUndefined(read(fare, ["departureDate"])) ?? day,
      arrival: stringOrUndefined(read(fare, ["arrivalDate"])),
      currency: stringOrUndefined(read(price, ["currencyCode"])) ?? input.currency,
      price: numberOrUndefined(read(price, ["value"])),
      fareClass: "fare-finder",
      raw: fare
    });
  }

  return flights.sort((a, b) => a.departure.localeCompare(b.departure));
}

export function parseRyanairAvailability(data: unknown, input: FlightSearchInput): FlightOption[] {
  const trips = asArray(read(data, ["trips"]));
  const flights: FlightOption[] = [];

  for (const trip of trips) {
    const dates = asArray(read(trip, ["dates"]));
    for (const date of dates) {
      const dateOut = read(date, ["dateOut"]);
      const dateFlights = asArray(read(date, ["flights"]));
      for (const flight of dateFlights) {
        const regularFare = read(flight, ["regularFare"]);
        const fares = asArray(read(regularFare, ["fares"]));
        const firstFare = fares[0] as Record<string, unknown> | undefined;
        const amount = numberOrUndefined(read(firstFare, ["amount"])) ?? numberOrUndefined(read(regularFare, ["amount"]));

        flights.push({
          airline: "ryanair",
          origin: String(read(flight, ["origin"]) ?? input.origin).toUpperCase(),
          destination: String(read(flight, ["destination"]) ?? input.destination).toUpperCase(),
          departure: String(read(flight, ["time", 0]) ?? read(flight, ["timeUTC", 0]) ?? dateOut ?? input.dateOut),
          arrival: stringOrUndefined(read(flight, ["time", 1]) ?? read(flight, ["timeUTC", 1])),
          flightNumber: stringOrUndefined(read(flight, ["flightNumber"])),
          currency: stringOrUndefined(read(regularFare, ["currency"]) ?? read(firstFare, ["currency"])) ?? input.currency,
          price: amount,
          fareClass: stringOrUndefined(read(firstFare, ["type"])) ?? "regular",
          raw: flight
        });
      }
    }
  }

  return flights;
}

function read(value: unknown, path: Array<string | number>): unknown {
  return path.reduce<unknown>((current, key) => {
    if (current == null) return undefined;
    if (typeof key === "number" && Array.isArray(current)) return current[key];
    if (typeof current === "object" && key in current) return (current as Record<string, unknown>)[key];
    return undefined;
  }, value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function dayWindow(date: string, before: number, after: number): Set<string> {
  const result = new Set<string>();
  const base = new Date(`${date}T00:00:00Z`);
  for (let offset = -before; offset <= after; offset += 1) {
    const current = new Date(base);
    current.setUTCDate(base.getUTCDate() + offset);
    result.add(current.toISOString().slice(0, 10));
  }
  return result;
}
