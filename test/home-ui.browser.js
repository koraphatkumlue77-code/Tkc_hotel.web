// Run with the Playwright browser_run_code_unsafe tool's filename argument.
// This public-surface check creates no accounts, bookings or payments.
async (page) => {
  const base = "http://localhost:3000";
  const checks = [];
  const selectSeason = async (label) => {
    const widget = page.locator("#attraction-season").locator("..");
    await widget.locator(".themed-select-trigger").click();
    await widget.getByRole("option", { name: label, exact: true }).click();
  };
  const check = (condition, name) => {
    if (!condition) throw new Error(name);
    checks.push(name);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.locator(".room-card").nth(3).waitFor();
  check(
    (await page.locator("video.hero-media").count()) === 2,
    "Hero uses two local videos",
  );
  check(
    (await page.locator("#hero-motion").count()) === 0,
    "Hero has no visible playback button",
  );
  await page.waitForFunction(
    () => document.querySelector("video.hero-media").videoWidth > 0,
  );
  const video = await page
    .locator("#hero-video")
    .evaluate((element) => ({
      width: element.videoWidth,
      height: element.videoHeight,
      loop: element.loop,
      muted: element.muted,
      controls: element.controls,
    }));
  check(
    video.width >= 1920 &&
      video.height >= 1080 &&
      video.loop &&
      video.muted &&
      !video.controls,
    "Full HD video loops silently without controls",
  );
  const headerAlignment = await page
    .locator(".header-actions")
    .evaluate((element) => {
      const login = element
        .querySelector(".login-button")
        .getBoundingClientRect();
      const language = element
        .querySelector(".language-label")
        .getBoundingClientRect();
      return Math.abs(
        login.y + login.height / 2 - language.y - language.height / 2,
      );
    });
  check(headerAlignment < 1, "Language and login controls share a centerline");
  const roomSelector = page.locator(".room-field .themed-select-trigger");
  await roomSelector.focus();
  await page.keyboard.press("ArrowDown");
  check(
    await page.locator('.room-field [role="listbox"]').isVisible(),
    "Room choices open with keyboard",
  );
  await page.keyboard.press("Escape");
  check(
    (await roomSelector.getAttribute("aria-expanded")) === "false",
    "Escape closes room choices",
  );
  await page.locator("#checkin").click();
  check(
    await page.locator(".themed-calendar").evaluate((dialog) => dialog.open),
    "Themed date picker opens",
  );
  await page.keyboard.press("Escape");
  check(
    !(await page.locator(".themed-calendar").evaluate((dialog) => dialog.open)),
    "Escape closes themed date picker",
  );
  await page.locator(".attraction-card").nth(9).waitFor();
  check(
    (await page.locator(".attraction-card p:visible").count()) === 1,
    "Only the selected destination shows details",
  );
  const photos = await page
    .locator(".room-photo")
    .evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  check(new Set(photos).size === 4, "Four distinct room images");
  check(
    photos.every((path) => path.startsWith("/assets/")),
    "Room images are local assets",
  );
  for (const kind of ["pool", "market"]) {
    await page.locator(`[data-facility="${kind}"]`).click();
    check(
      await page
        .locator("#experience-dialog")
        .evaluate((dialog) => dialog.open),
      `${kind} detail dialog opens`,
    );
    check(
      (await page.locator("#experience-image").getAttribute("src")).startsWith(
        "/assets/",
      ),
      `${kind} detail image is local`,
    );
    await page.keyboard.press("Escape");
    check(
      !(await page
        .locator("#experience-dialog")
        .evaluate((dialog) => dialog.open)),
      `${kind} dialog closes with Escape`,
    );
  }
  await selectSeason("ฤดูฝน");
  check(
    (await page.locator("#attraction-list").innerText()).includes("หลังฝน"),
    "Rainy season content is available",
  );
  await selectSeason("ฤดูหนาว");
  check(
    (await page.locator("#attraction-list").innerText()).includes("ลมหนาว"),
    "Winter content is available",
  );
  await selectSeason("ทุกฤดู");
  await page.evaluate(async () => {
    const images = [...document.images];
    images.forEach((image) => (image.loading = "eager"));
    await Promise.all(images.map((image) => image.decode().catch(() => {})));
  });
  const broken = await page
    .locator("img")
    .evaluateAll((images) =>
      images.filter((image) => !image.naturalWidth).map((image) => image.src),
    );
  check(broken.length === 0, `All displayed images load: ${broken.join(", ")}`);
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({
    path: "D:/tmp/tkc_hotel/Tkc_hotel.web/artifacts/home-desktop-final.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "No mobile horizontal overflow",
  );
  await page.evaluate(() => window.scrollTo({ top: 430, behavior: "instant" }));
  await page.locator(".guest-control .themed-select-trigger").click();
  const guestList = page.locator('.guest-control [role="listbox"]');
  check(
    !(await guestList.evaluate((element) =>
      element.classList.contains("opens-up"),
    )),
    "Guest list can open downwards",
  );
  const lastGuest = guestList.getByRole("option", {
    name: "6 คน",
    exact: true,
  });
  await lastGuest.scrollIntoViewIfNeeded();
  check(
    await lastGuest.evaluate((element) => {
      const r = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return hit === element || element.contains(hit);
    }),
    "Guest choice remains clickable beyond hero",
  );
  await lastGuest.click();
  check(
    (await page.locator("#guests").inputValue()) === "6",
    "Guest selection updates underlying form",
  );
  await page.locator("#menu-toggle").click();
  check(
    await page
      .locator("#main-nav")
      .evaluate((nav) => nav.classList.contains("open")),
    "Mobile menu opens",
  );
  await page.locator('#main-nav a[href="#rooms"]').click();
  await page.waitForFunction(
    () => document.querySelector("#main-nav a.active")?.hash === "#rooms",
  );
  check(
    (await page.locator("#menu-toggle").getAttribute("aria-expanded")) ===
      "false",
    "Mobile menu closes after navigation",
  );
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({
    path: "D:/tmp/tkc_hotel/Tkc_hotel.web/artifacts/home-mobile-final.png",
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(
    () => document.querySelector("video.hero-media").paused,
  );
  check(
    await page
      .locator("#hero-video")
      .evaluate(
        (element) =>
          element.paused && getComputedStyle(element).opacity === "0",
      ),
    "Reduced motion shows the still poster",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/api/attractions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 101,
          name: "Summer one",
          season: "summer",
          description: "Example",
        },
        {
          id: 102,
          name: "Summer two",
          season: "summer",
          description: "Example",
        },
      ]),
    }),
  );
  await page.goto(base);
  await page.locator(".attraction-card").nth(1).waitFor();
  await selectSeason("ฤดูหนาว");
  check(
    (await page.locator("#attraction-next").isDisabled()) &&
      (await page.locator("#attraction-prev").isDisabled()) &&
      (await page.locator("#attraction-position").innerText()) === "0 / 0",
    "Empty seasons reset navigation and count",
  );
  await page.unroute("**/api/attractions");
  await page.goto(base);
  return checks;
}
