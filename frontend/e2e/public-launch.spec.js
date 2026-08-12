import { test, expect } from "@playwright/test";

test("public launch metadata and crawler files are publishable", async ({
  page,
  request,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle("The Socratic Arena | Train Your Thinking");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://socratic-arena.vercel.app/",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://socratic-arena.vercel.app/og-socratic-arena.png",
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );

  const structuredData = JSON.parse(
    await page.locator('script[type="application/ld+json"]').textContent(),
  );
  expect(structuredData).toMatchObject({
    "@type": "WebApplication",
    name: "The Socratic Arena",
    url: "https://socratic-arena.vercel.app/",
  });

  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBeTruthy();
  await expect(robots.text()).resolves.toContain(
    "Sitemap: https://socratic-arena.vercel.app/sitemap.xml",
  );

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  await expect(sitemap.text()).resolves.toContain(
    "<loc>https://socratic-arena.vercel.app/</loc>",
  );
});
