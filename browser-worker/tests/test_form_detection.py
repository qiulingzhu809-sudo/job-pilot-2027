import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from job_pilot_browser.main import application_form_probe, generic_apply_button, generic_login_button, upload_resume_file
from playwright.async_api import async_playwright
from job_pilot_browser.main import ApplicationRun, StartApplication, resume_page
from job_pilot_browser.main import fill_known_fields, execute, close_run
from unittest.mock import patch


class ApplicationFormDetectionTest(unittest.IsolatedAsyncioTestCase):
    async def test_two_live_application_browsers_are_independent(self):
        async def prepare(run):
            await run.page.set_content("<h2>岗位页</h2>")
        with TemporaryDirectory() as directory, patch("job_pilot_browser.main.RUNTIME_DIR", Path(directory)), patch("job_pilot_browser.main.prepare_generic", prepare):
            request = StartApplication(job={"company":"测试", "role":"岗位", "official_url":"https://example.com/"}, profile={})
            first = ApplicationRun(id="first", request=request)
            second = ApplicationRun(id="second", request=request)
            try:
                await execute(first)
                await execute(second)
                self.assertNotEqual(second.status, "failed", second.result)
                self.assertFalse(first.page.is_closed())
                self.assertFalse(second.page.is_closed())
                await close_run(second)
                self.assertFalse(first.page.is_closed())
            finally:
                await close_run(first)
                await close_run(second)

    async def test_fills_associated_labels_and_skips_hidden_duplicates(self):
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()
            await page.set_content('''<label for="name">姓名</label><input id="name">
                <input placeholder="邮箱" hidden><input placeholder="邮箱" id="email">
                <input placeholder="年龄" id="age">''')
            count, missing = await fill_known_fields(page, {"personal":{"name":"测试候选人", "birthDate":"2000-01-01"},"contact":{"email":"test@example.com"}})
            self.assertEqual(count, 2)
            self.assertEqual(await page.locator("#name").input_value(), "测试候选人")
            self.assertEqual(await page.locator("#email").input_value(), "test@example.com")
            self.assertEqual(await page.locator("#age").input_value(), "")
            self.assertTrue(any("出生日期" in item for item in missing))
            await browser.close()

    async def test_resume_follows_manbang_application_tab_not_other_moka_tenant(self):
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            context = await browser.new_context()
            await context.route("**/*", lambda route: route.fulfill(body="<h2>个人信息</h2><label>姓名<input></label><input type='tel'>", content_type="text/html"))
            original = await context.new_page()
            await original.goto("https://campus.fulltruckalliance.com/")
            target = await context.new_page()
            await target.goto("https://app.mokahr.com/campus-recruitment/manbang/94191#/job/test/apply")
            unrelated = await context.new_page()
            await unrelated.goto("https://app.mokahr.com/campus-recruitment/other/123#/job/test/apply")
            run = ApplicationRun(id="test", request=StartApplication(job={"company":"满帮", "role":"测试岗位", "official_url":"https://campus.fulltruckalliance.com/"}, profile={}), context=context, page=original)
            self.assertIs(await resume_page(run), target)
            await browser.close()

    async def test_apply_entry_skips_non_interactive_duplicates(self) -> None:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.set_content('''
                <button style="pointer-events:none">申请职位</button>
                <button disabled>申请职位</button>
                <div style="position:relative;width:160px;height:50px">
                  <button>申请职位</button>
                  <div style="position:absolute;inset:0;background:white"></div>
                </div>
                <button id="real" onclick="this.textContent='已打开申请表'">申请职位</button>
            ''')
            entry = await generic_apply_button(page)
            self.assertIsNotNone(entry)
            self.assertEqual(await entry.get_attribute("id"), "real")
            await entry.click(timeout=1000)
            self.assertEqual(await page.locator("#real").inner_text(), "已打开申请表")
            await browser.close()

    async def test_detects_resume_and_basic_info_form_inside_iframe(self) -> None:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.set_content(
                """
                <iframe id="application"></iframe>
                <script>
                  const doc = document.querySelector('#application').contentDocument;
                  doc.body.innerHTML = `
                    <h2>附件简历</h2>
                    <input type="file" />
                    <h2>基本信息</h2>
                    <label>姓名 <input type="text" /></label>
                    <label>性别 <input type="radio" name="gender" />男</label>
                    <label>手机号 <input type="text" /></label>
                  `;
                </script>
                """
            )

            evidence = await application_form_probe(page)

            self.assertIsNotNone(evidence)
            await browser.close()

    async def test_does_not_treat_phone_login_as_application_form(self) -> None:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.set_content(
                """
                <h2>登录/注册</h2>
                <label>手机号 <input type="tel" /></label>
                <input placeholder="短信验证码" />
                """
            )

            evidence = await application_form_probe(page)

            self.assertIsNone(evidence)
            await browser.close()

    async def test_detects_standard_application_form_in_main_document(self) -> None:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.set_content(
                """
                <h2>个人信息</h2>
                <label>姓名 <input type="text" /></label>
                <label>手机号 <input type="tel" /></label>
                """
            )

            evidence = await application_form_probe(page)

            self.assertIsNotNone(evidence)
            await browser.close()

    async def test_uploads_resume_to_file_input_inside_iframe(self) -> None:
        with TemporaryDirectory() as directory:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                page = await browser.new_page()
                await page.set_content(
                    """
                    <iframe id="application"></iframe>
                    <script>
                      const doc = document.querySelector('#application').contentDocument;
                      doc.body.innerHTML = '<input type="file" />';
                    </script>
                    """
                )
                resume = Path(directory) / "resume.pdf"
                resume.write_bytes(b"%PDF-1.4\n")

                uploaded = await upload_resume_file(page, resume)

                self.assertTrue(uploaded)
                frame = page.frames[-1]
                self.assertEqual(await frame.locator("input[type='file']").input_value(), "C:\\fakepath\\resume.pdf")
                await browser.close()

    async def test_finds_generic_apply_entry_inside_iframe(self) -> None:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.set_content(
                """
                <iframe id="job"></iframe>
                <script>
                  const doc = document.querySelector('#job').contentDocument;
                  doc.body.innerHTML = '<button>立即申请</button>';
                </script>
                """
            )

            entry = await generic_apply_button(page)

            self.assertIsNotNone(entry)
            self.assertEqual(await entry.inner_text(), "立即申请")
            await browser.close()

    async def test_finds_real_login_control_inside_iframe(self) -> None:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.set_content(
                """
                <p>登录后可继续申请</p>
                <iframe id="job"></iframe>
                <script>
                  const doc = document.querySelector('#job').contentDocument;
                  doc.body.innerHTML = '<a href="#login">登录/注册</a>';
                </script>
                """
            )

            entry = await generic_login_button(page)

            self.assertIsNotNone(entry)
            self.assertEqual(await entry.inner_text(), "登录/注册")
            await browser.close()


if __name__ == "__main__":
    unittest.main()
