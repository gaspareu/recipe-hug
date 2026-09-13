import { devices, expect, test } from '@playwright/test';

const railWidth = 44;
const mobileUserAgent = devices['iPhone 13'].userAgent;

const viewports = [
  { name: 'iPhone 15', width: 393, height: 852 },
  { name: 'iPhone SE (3e génération)', width: 375, height: 667 },
] as const;

for (const viewport of viewports) {
  test.describe(`accueil avec signets — ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      screen: { width: viewport.width, height: viewport.height },
      userAgent: mobileUserAgent,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });

    test('garde le composeur dans la largeur disponible sans scroll horizontal', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });

      await page.goto('/home');
      const shell = page.getByTestId('home-shell');
      await expect.poll(
        () => shell.evaluate((element) => element.getBoundingClientRect().top),
      ).toBeCloseTo(0, 0);

      const bounds = await page.getByTestId('chat-composer').evaluate((composer) => {
        const rect = composer.getBoundingClientRect();
        const shell = document.querySelector<HTMLElement>('[data-testid="home-shell"]');
        const rail = document.querySelector<HTMLElement>('nav[aria-label="Navigation principale"]');
        const shellRect = shell?.getBoundingClientRect();
        const railRect = rail?.getBoundingClientRect();
        const visualViewport = window.visualViewport;
        return {
          composerLeft: rect.left,
          composerRight: rect.right,
          documentWidth: document.documentElement.scrollWidth,
          railTop: railRect?.top,
          shellTop: shellRect?.top,
          shellBottom: shellRect?.bottom,
          visibleBottom: (visualViewport?.offsetTop ?? 0)
            + Math.min(visualViewport?.height ?? window.innerHeight, window.innerHeight),
          viewportWidth: window.innerWidth,
        };
      });

      expect(bounds.documentWidth).toBe(bounds.viewportWidth);
      expect(bounds.composerLeft).toBeGreaterThanOrEqual(0);
      expect(bounds.composerRight).toBeCloseTo(viewport.width - railWidth, 0);
      expect(bounds.railTop).toBeCloseTo(bounds.shellTop ?? 0, 0);
      expect(bounds.shellBottom).toBeCloseTo(bounds.visibleBottom, 0);
      expect(consoleErrors).toEqual([]);
    });
  });
}
