import asyncio
import json
import re

from playwright.async_api import async_playwright


TARGETS = [
    ("海尔前端", "https://maker.haier.net/client/campus/deliverfirst/id/47/fid/7/rid/31.html"),
    ("新意科技前端", "https://oawx.shinetechnology.com/phone/position/view?positionId=2c9082839e59f796019ea62514140003"),
    ("字节前端", "https://jobs.bytedance.com/campus/position/7532117399866099986/detail"),
    ("易思维校招", "https://isv-tech.zhiye.com/campus"),
    ("顺丰科技校招", "https://campus.sf-express.com/#/homePage"),
    ("新浪微博 Moka", "https://app.mokahr.com/campus-recruitment/sina/43536"),
]

ENTRY_PATTERN = re.compile(r"申请职位|申请岗位|立即申请|投递简历|填写应聘单|立即投递|投递")
LOGIN_PATTERN = re.compile(r"登录|注册|验证码")


async def inspect(page, name: str, url: str) -> dict:
    result = {"name": name, "requested_url": url}
    try:
        response = await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        await page.wait_for_timeout(2_000)
        body = " ".join((await page.locator("body").inner_text(timeout=8_000)).split())
        entry_texts = []
        entry_locator = None
        for frame in page.frames:
            controls = frame.locator("button, a, [role='button']")
            control_texts = [text.strip() for text in await controls.all_text_contents() if text.strip()]
            entry_texts.extend(text for text in control_texts if ENTRY_PATTERN.search(text))
            if entry_locator is None:
                candidate = controls.filter(has_text=ENTRY_PATTERN).first
                if await candidate.count() and await candidate.is_visible():
                    entry_locator = candidate
        result.update(
            ok=True,
            http_status=response.status if response else None,
            final_url=page.url,
            title=await page.title(),
            entry_texts=list(dict.fromkeys(entry_texts))[:8],
            login_signal=bool(LOGIN_PATTERN.search(body)),
            application_signal=bool(re.search(r"姓名|手机号|邮箱|附件简历|上传简历|个人信息", body)),
            input_count=await page.locator("input").count(),
            iframe_count=len(page.frames) - 1,
        )
        if entry_locator is not None:
            pages_before = set(page.context.pages)
            await entry_locator.click(timeout=8_000)
            await page.wait_for_timeout(2_000)
            new_pages = [candidate for candidate in page.context.pages if candidate not in pages_before]
            destination = new_pages[-1] if new_pages else page
            destination_body = " ".join((await destination.locator("body").inner_text(timeout=8_000)).split())
            result.update(
                clicked_entry=True,
                destination_url=destination.url,
                destination_login_signal=bool(LOGIN_PATTERN.search(destination_body)),
                destination_application_signal=bool(re.search(r"姓名|手机号|邮箱|附件简历|上传简历|个人信息", destination_body)),
                destination_input_count=sum([await frame.locator("input").count() for frame in destination.frames]),
                destination_iframe_count=len(destination.frames) - 1,
            )
        else:
            result["clicked_entry"] = False
    except Exception as exc:
        result.update(ok=False, error=f"{type(exc).__name__}: {exc}"[:300])
    return result


async def main() -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(locale="zh-CN")
        results = []
        for name, url in TARGETS:
            page = await context.new_page()
            results.append(await inspect(page, name, url))
            await page.close()
        await browser.close()
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
