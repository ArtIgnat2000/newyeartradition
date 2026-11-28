import { expect, test } from "@playwright/test";

test("region map dialog traps focus and restores it on Escape", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Слайд 10: Поволжье — Новый год" })
    .click();
  const trigger = page.locator('.slide.active [data-action="open-region-map"]');
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Регионы Поволжья" });
  const close = page.getByRole("button", { name: "Закрыть глобус" });
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("link", { name: /Открыть в Google Earth/ }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("theatre control responds to the F shortcut", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("f");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Boolean(document.fullscreenElement) ||
          document.body.classList.contains("theatre"),
      ),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          !document.fullscreenElement &&
          !document.body.classList.contains("theatre"),
      ),
    )
    .toBe(true);
});
