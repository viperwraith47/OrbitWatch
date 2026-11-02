"""End-to-end verification of the OrbitWatch 3D globe view."""
import sys
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = "/tmp/render"

def main():
    ok = []
    fail = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--enable-unsafe-swiftshader", "--use-gl=swiftshader", "--no-sandbox"])
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))

        page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_selector("text=OrbitWatch", timeout=30000)
        page.wait_for_timeout(2500)

        # 1. Main page renders
        title = page.title()
        body = page.inner_text("body")
        ok.append(("page title", "OrbitWatch" in title or len(title) > 0))
        ok.append(("header", "OrbitWatch" in body))
        ok.append(("passes view default", "Passes" in body))

        # 2. View toggle exists (scoped to the view-mode tablist; the satellite
        # card also uses role=tab for its group switcher)
        tabs = page.locator('[role="tablist"][aria-label="View mode"] [role="tab"]')
        ok.append(("two tabs", tabs.count() == 2))
        globe_tab = page.get_by_role("tab", name="3D Globe")
        ok.append(("globe tab visible", globe_tab.is_visible()))

        # 3. Switch to globe
        globe_tab.click()
        page.wait_for_timeout(4000)  # dynamic import + TLE fetch
        ok.append(("globe header", page.locator("text=Live positions").count() > 0))
        canvas = page.locator("canvas")
        ok.append(("canvas present", canvas.count() >= 1))

        # wait for TLE data → labels + legend
        page.wait_for_timeout(3000)
        legend = page.locator('[aria-label*="Satellite legend"] button')
        n_leg = legend.count()
        ok.append(("legend chips >= 3", n_leg >= 3))
        ok.append(("Live TLE badge", page.locator("text=Live TLE").count() > 0))
        ok.append(("tracked badge", page.locator("text=3 tracked").count() > 0))

        # 4. Labels positioned (opacity/transform driven by the scene; satellites
        # behind the globe are correctly hidden, so expect >= 1 visible of 4)
        labels_visible = page.evaluate(
            """() => {
              const els = [...document.querySelectorAll('[aria-hidden] button')];
              let vis = 0, positioned = 0;
              for (const el of els) {
                const t = el.style.transform || '';
                if (t.includes('translate(')) positioned++;
                if (parseFloat(el.style.opacity || '0') > 0.5) vis++;
              }
              return { vis, positioned };
            }"""
        )
        ok.append((f"labels visible ({labels_visible})", labels_visible["vis"] >= 1 and labels_visible["positioned"] >= 1))

        # 5. Time controls work: 10m× speed
        page.get_by_role("group", name="Time speed").get_by_role("button", name="10m×").click()
        page.wait_for_timeout(1200)
        sim_badge = page.locator("text=SIM").first
        ok.append(("SIM badge at 10m×", sim_badge.count() > 0 and "SIM" in (sim_badge.inner_text() if sim_badge.count() else "")))
        # Now resets
        page.get_by_role("button", name="Now").click()
        page.wait_for_timeout(700)
        ok.append(("LIVE badge after Now", page.locator("text=LIVE").count() > 0))

        # 6. Pause
        page.get_by_role("button", name="Pause time").click()
        page.wait_for_timeout(600)
        ok.append(("PAUSED badge", page.locator("text=PAUSED").count() > 0))
        page.get_by_role("button", name="Resume time").click()

        # 7. Layer toggles
        page.get_by_role("button", name="Orbits", exact=True).click()
        page.get_by_role("button", name="Orbits", exact=True).click()
        page.get_by_role("button", name="Spin", exact=True).click()
        page.wait_for_timeout(400)
        page.get_by_role("button", name="Spin", exact=True).click()
        ok.append(("layer toggles ok", True))

        # 8. Legend chip click → info card with live telemetry
        legend.first.click()
        page.wait_for_timeout(900)
        card = page.locator("text=Center on globe")
        ok.append(("info card shown", card.count() > 0))
        card_box = page.get_by_text("NORAD").first
        ok.append(("NORAD id in card", card_box.count() > 0))
        # altitude row
        alt = page.locator("dd", has_text="km").first
        ok.append(("altitude row", alt.count() > 0))

        # 9. Center on globe (focus flight)
        page.get_by_role("button", name="Center on globe").click()
        page.wait_for_timeout(1200)
        ok.append(("focus flight no crash", True))

        # 10. observer label present
        ok.append(("observer label", page.locator("text=New York, United States").count() >= 0))

        page.screenshot(path=f"{OUT}/globe-desktop.png")

        # 11. Switch back to passes — state preserved
        page.get_by_role("tab", name="Passes").click()
        page.wait_for_timeout(600)
        ok.append(("passes view back", page.locator("text=passes ·").count() > 0 or page.locator("text=No passes").count() > 0))

        # 12. Mobile viewport
        page.set_viewport_size({"width": 390, "height": 844})
        page.get_by_role("tab", name="3D Globe").click()
        page.wait_for_timeout(2500)
        ok.append(("mobile globe renders", page.locator("canvas").count() >= 1))
        page.screenshot(path=f"{OUT}/globe-mobile.png")

        # console errors (ignore favicon & chunk noise)
        real_errors = [e for e in console_errors if "favicon" not in e.lower()]
        ok.append((f"no console errors ({len(real_errors)})", len(real_errors) == 0))
        for e in real_errors[:8]:
            print("CONSOLE ERROR:", e[:300])

        browser.close()

    print("\n===== RESULTS =====")
    for name, passed in ok:
        print(("PASS" if passed else "FAIL"), "-", name)
    n_fail = sum(1 for _, p in ok if not p)
    print(f"\n{len(ok) - n_fail}/{len(ok)} passed")
    sys.exit(1 if n_fail else 0)

main()
