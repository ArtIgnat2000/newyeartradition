import { expect, test } from "@playwright/test";

test("slide 10 keeps region controls below the image without horizontal overflow", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".slide.active h1")).toBeVisible();

  await page
    .getByRole("button", { name: "Слайд 10: Поволжье — Новый год" })
    .click();
  const selector = page.locator(".slide.active .volga-region-labels");
  const illustration = page.locator(".slide.active .volga-visual");
  await expect(selector).toBeVisible();
  await expect(illustration).toBeVisible();

  const layoutOrder = await page.evaluate(() => {
    const slide = document.querySelector('.slide[data-layout="volga"]');
    const layout = slide.querySelector(":scope > .layout");
    const selectors = slide.querySelector(":scope > .volga-region-labels");
    const image = slide.querySelector(".volga-visual");
    return {
      controlsFollowLayout: layout.nextElementSibling === selectors,
      controlsAfterImage:
        image.getBoundingClientRect().bottom <=
        selectors.getBoundingClientRect().top,
      noHorizontalOverflow:
        document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
  expect(layoutOrder.controlsFollowLayout).toBe(true);
  expect(layoutOrder.controlsAfterImage).toBe(true);
  expect(layoutOrder.noHorizontalOverflow).toBe(true);

  await page.locator(".volga-region-choice").nth(1).click();
  await expect(page.locator("#volgaImage")).toHaveAttribute(
    "src",
    /volga-mari-el-storybook\.jpg$/,
  );
});

test("non-cover artwork uses deferred image decoding", async ({ page }) => {
  await page.goto("/");
  const lazyImages = await page
    .locator('img[src^="images/"][loading="lazy"]')
    .count();
  expect(lazyImages).toBeGreaterThan(0);
  await expect(
    page.locator('img[src$="cover-ded-moroz-proportioned.jpg"]'),
  ).toHaveAttribute("fetchpriority", "high");
});
