import asyncio
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from playwright.async_api import BrowserContext, Frame, Page, Playwright, TimeoutError as PlaywrightTimeoutError, async_playwright
from pydantic import BaseModel, Field, HttpUrl

PROJECT_ROOT = Path(__file__).resolve().parents[3]
RUNTIME_DIR = PROJECT_ROOT / ".runtime"
LOGIN_LABELS = ("登录", "登录/注册", "注册/登录", "立即登录", "账号登录", "手机号登录", "扫码登录")


class JobTarget(BaseModel):
    company: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=200)
    official_url: HttpUrl


class StartApplication(BaseModel):
    job: JobTarget
    profile: dict[str, Any]


class ResumeApplication(BaseModel):
    profile: dict[str, Any]


class ApplicationView(BaseModel):
    id: str
    status: Literal["queued", "running", "waiting_user", "ready", "review", "unsupported", "failed", "closed"]
    message: str
    step: int
    created_at: str
    updated_at: str
    result: str | None = None
    resume_name: str | None = None
    resume_ready: bool = False


@dataclass
class ApplicationRun:
    id: str
    request: StartApplication
    status: str = "queued"
    message: str = "等待 Browser Harness"
    step: int = 0
    result: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    task: asyncio.Task[None] | None = None
    playwright: Playwright | None = None
    context: BrowserContext | None = None
    page: Page | None = None
    resume_path: Path | None = None
    resume_name: str | None = None

    def update(self, *, status: str | None = None, message: str | None = None, step: int | None = None) -> None:
        if status is not None:
            self.status = status
        if message is not None:
            self.message = message
        if step is not None:
            self.step = step
        self.updated_at = datetime.now(UTC).isoformat()

    def view(self) -> ApplicationView:
        return ApplicationView(
            id=self.id, status=self.status, message=self.message, step=self.step,
            created_at=self.created_at, updated_at=self.updated_at, result=self.result,
            resume_name=self.resume_name,
            resume_ready=self.resume_path is not None and self.resume_path.exists(),
        )


app = FastAPI(title="Job Pilot Browser Harness", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["content-type"],
)
runs: dict[str, ApplicationRun] = {}
SUPPORTED_HOSTS = {
    "recruit.sinovatio.com": "中新赛克招聘",
    "app.mokahr.com": "Moka 招聘系统",
}
APPLY_TEXT = re.compile(r"^\s*(申请职位|申请岗位|立即申请|投递简历|立即投递|我要应聘|填写应聘单)\s*$")


def profile_value(profile: dict[str, Any], section: str, field_name: str) -> str:
    section_value = profile.get(section)
    if not isinstance(section_value, dict):
        return ""
    value = section_value.get(field_name)
    return value.strip() if isinstance(value, str) else ""


def page_scopes(page: Page) -> list[Frame]:
    """Search the main document and every attached iframe."""
    return page.frames


async def first_visible(page: Page, selectors: list[str], *, editable: bool = False):
    for scope in page_scopes(page):
        for selector in selectors:
            for locator in await scope.locator(selector).all():
                if await locator.is_visible() and (not editable or await locator.is_editable()):
                    return locator
    return None


async def upload_resume_file(page: Page, resume_path: Path) -> bool:
    for scope in page_scopes(page):
        file_inputs = scope.locator("input[type='file']")
        if await file_inputs.count():
            await file_inputs.first.set_input_files(str(resume_path))
            return True
    return False


async def fill_and_upload(run: ApplicationRun) -> tuple[int, list[str], str]:
    assert run.page is not None
    filled, missing = await fill_known_fields(run.page, run.request.profile)
    resume_status = "未提供基础简历"
    if run.resume_path and run.resume_path.exists():
        resume_status = "基础简历已上传" if await upload_resume_file(run.page, run.resume_path) else "未找到简历上传入口"
    return filled, missing, resume_status


async def fill_known_fields(page: Page, profile: dict[str, Any]) -> tuple[int, list[str]]:
    fields = [
        ("姓名", profile_value(profile, "personal", "name"), ["input[placeholder*='姓名']", "input[name='name' i]", "label:has-text('姓名') input"], True),
        ("手机号", profile_value(profile, "contact", "phone"), ["input[placeholder*='手机']", "input[type='tel']", "input[name='phone' i]", "label:has-text('手机') input"], True),
        ("邮箱", profile_value(profile, "contact", "email"), ["input[placeholder*='邮箱']", "input[type='email']", "input[name='email' i]", "label:has-text('邮箱') input"], True),
        ("出生日期", profile_value(profile, "personal", "birthDate"), ["input[placeholder*='出生日期']"], True),
        ("所在地", profile_value(profile, "contact", "currentCity"), ["input[placeholder*='所在地']", "input[placeholder*='现居']"], True),
        ("意向工作城市", profile_value(profile, "preference", "preferredCities"), ["input[placeholder*='意向工作城市']", "input[placeholder*='意向城市']"], True),
        ("学校", profile_value(profile, "education", "school"), ["input[placeholder*='学校']", "input[name='school' i]"], True),
        ("专业", profile_value(profile, "education", "major"), ["input[placeholder*='专业']", "input[name='major' i]"], True),
    ]
    filled = 0
    missing: list[str] = []
    for label, value, selectors, required in fields:
        if not value:
            if required:
                missing.append(label)
            continue
        locator = None
        for scope in page_scopes(page):
            matches = scope.get_by_label(re.compile(r"^\s*\*?\s*" + re.escape(label) + r"\s*\*?\s*$"))
            for candidate in await matches.all():
                if await candidate.is_visible() and await candidate.is_editable():
                    locator = candidate
                    break
            if locator is not None:
                break
        if locator is None:
            locator = await first_visible(page, selectors, editable=True)
        if locator is None:
            missing.append(f"{label}（未定位到可填写控件）")
            continue
        if not await locator.input_value():
            await locator.fill(value)
            if await locator.input_value() == value:
                filled += 1
            else:
                missing.append(f"{label}（写入后校验失败）")
    return filled, missing


async def choose_known_option(page: Page, label: str, value: str) -> int:
    if not value:
        return 0
    label_locator = None
    scope_with_label: Frame | None = None
    for scope in page_scopes(page):
        candidate = scope.get_by_text(label, exact=True).first
        if await candidate.count() and await candidate.is_visible():
            label_locator = candidate
            scope_with_label = scope
            break
    if label_locator is None or scope_with_label is None:
        return 0
    container = label_locator.locator("xpath=..").first
    if value in await container.inner_text():
        return 0
    control = container.locator("[role='combobox'], [class*='select']").first
    if not await control.count() or not await control.is_visible():
        return 0
    await control.click()
    option = scope_with_label.get_by_text(value, exact=True).last
    try:
        await option.wait_for(state="visible", timeout=2_000)
        await option.click()
        return 1
    except PlaywrightTimeoutError:
        return 0


async def fill_known_options(page: Page, profile: dict[str, Any]) -> int:
    filled = 0
    filled += await choose_known_option(page, "性别", profile_value(profile, "personal", "gender"))
    filled += await choose_known_option(page, "最高学历", profile_value(profile, "education", "educationLevel"))
    return filled


async def application_form_probe(page: Page):
    signal_groups = [
        (3, ["text=附件简历", "text=上传简历", "input[type='file']"]),
        (2, ["text=基本信息", "text=个人信息"]),
        (2, ["input[placeholder*='姓名']", "input[name='name' i]", "label:has-text('姓名') input"]),
        (1, ["input[placeholder*='手机']", "input[type='tel']", "input[name='phone' i]", "label:has-text('手机') input"]),
        (1, ["input[placeholder*='邮箱']", "input[type='email']", "input[name='email' i]", "label:has-text('邮箱') input"]),
        (1, ["input[placeholder*='学校']", "label:has-text('学校') input"]),
        (1, ["input[placeholder*='专业']", "label:has-text('专业') input"]),
    ]
    for scope in page_scopes(page):
        score = 0
        evidence = None
        for weight, selectors in signal_groups:
            for selector in selectors:
                locator = scope.locator(selector).first
                if await locator.count() and (selector == "input[type='file']" or await locator.is_visible()):
                    score += weight
                    evidence = locator
                    break
        # A login form normally exposes only a phone/email field. Requiring
        # multiple independent application signals avoids that false positive.
        if score >= 4:
            return evidence
    return None


async def actionable_candidate(candidates):
    """Trial clicks include hit testing; visible duplicates may not receive events."""
    for candidates_for_selector in candidates:
        for locator in await candidates_for_selector.all():
            if not await locator.is_visible() or not await locator.is_enabled():
                continue
            if await locator.evaluate("el => getComputedStyle(el).pointerEvents === 'none'"):
                continue
            try:
                await locator.click(trial=True, timeout=700)
                return locator
            except PlaywrightTimeoutError:
                continue
    return None


async def generic_apply_button(page: Page):
    for scope in page_scopes(page):
        candidate = await actionable_candidate([
            scope.get_by_role("button", name=APPLY_TEXT),
            scope.locator("a, button, [role='button']").filter(has_text=APPLY_TEXT),
        ])
        if candidate is not None:
            return candidate
    return None


async def generic_login_button(page: Page):
    """Return a real login control, avoiding broad text nodes and page copy."""
    for scope in page_scopes(page):
        for label in LOGIN_LABELS:
            candidates = [
                scope.get_by_role("button", name=label, exact=True).first,
                scope.get_by_role("link", name=label, exact=True).first,
                scope.locator("button, a, [role='button']").filter(has_text=label).first,
            ]
            for locator in candidates:
                if await locator.count() and await locator.is_visible():
                    return locator
    return None


async def click_entry_and_follow(page: Page, entry) -> Page:
    pages_before = set(page.context.pages)
    await entry.click(timeout=8_000)
    await page.wait_for_timeout(1_200)
    new_pages = [candidate for candidate in page.context.pages if candidate not in pages_before]
    if new_pages:
        destination = new_pages[-1]
        await destination.wait_for_load_state("domcontentloaded")
        return destination
    return page


async def login_probe(page: Page) -> bool:
    return await first_visible(page, [
        "text=登录", "text=登录/注册", "text=手机验证码", "input[placeholder*='验证码']",
    ]) is not None


async def trigger_login(page: Page) -> tuple[Page, bool]:
    entry = await generic_login_button(page)
    if entry is None:
        return page, False
    try:
        return await click_entry_and_follow(page, entry), True
    except PlaywrightTimeoutError:
        return page, False


async def review_current_form(run: ApplicationRun, message: str) -> None:
    assert run.page is not None
    filled, missing, resume_status = await fill_and_upload(run)
    filled += await fill_known_options(run.page, run.request.profile)
    run.result = f"已填写 {filled} 个基础字段；{resume_status}；资料库缺少：{', '.join(missing) if missing else '无'}。"
    run.update(status="review", step=3, message=message)


async def prepare_generic(run: ApplicationRun) -> None:
    assert run.page is not None
    page = run.page
    await page.goto(str(run.request.job.official_url), wait_until="domcontentloaded")
    await page.wait_for_timeout(1_500)
    run.update(status="running", step=1, message="正在通用识别岗位页、登录态和申请入口")

    if await application_form_probe(page) is not None:
        await review_current_form(run, "已识别通用申请表，请检查未映射字段；最终提交由你完成")
        return

    entry = await generic_apply_button(page)
    if entry is not None:
        page = await click_entry_and_follow(page, entry)
        run.page = page
        if await application_form_probe(page) is not None:
            await review_current_form(run, "已进入通用申请表，请检查未映射字段；最终提交由你完成")
            return

    page, login_triggered = await trigger_login(page)
    run.page = page
    if await application_form_probe(page) is not None:
        await review_current_form(run, "已进入通用申请表，请检查未映射字段；最终提交由你完成")
        return

    if login_triggered:
        message = "登录入口已为你打开。请在 Harness 浏览器中完成手机号、扫码或验证码登录，再回到工作台点击醒目的“我已完成登录，开始填写”"
    elif await login_probe(page):
        message = "已定位到登录步骤。请在 Harness 浏览器中完成手机号、扫码或验证码登录，再回到工作台点击醒目的“我已完成登录，开始填写”"
    elif entry is None:
        message = "当前是招聘首页或岗位列表；请在 Harness 浏览器中选中具体岗位并进入申请页，然后点击“我已登录，继续填写”"
    else:
        message = "已打开申请入口，但尚未出现申请表；请完成页面上的登录或岗位确认后点击“我已登录，继续填写”"
    run.update(status="waiting_user", step=1, message=message)


async def moka_apply_button(page: Page):
    buttons = page.get_by_role("button", name="申请职位", exact=True)
    try:
        await buttons.first.wait_for(state="attached", timeout=5_000)
    except PlaywrightTimeoutError:
        return None
    return await actionable_candidate([buttons])


async def prepare_sinovatio(run: ApplicationRun) -> None:
    assert run.page is not None
    page = run.page
    request = run.request
    await page.goto(str(request.job.official_url), wait_until="domcontentloaded")
    run.update(step=1, message="正在检查招聘官网登录状态")
    login_entry = page.get_by_text("登录/注册", exact=True).first
    logged_out = await login_entry.count() and await login_entry.is_visible()
    if logged_out:
        await login_entry.click()
        run.update(
            status="waiting_user", step=1,
            message="登录入口已为你打开。请完成手机号或验证码登录，再回到工作台点击“我已完成登录，开始填写”",
        )
        return

    run.update(status="running", step=2, message="已确认登录，正在定位目标岗位和申请表")
    role = page.get_by_text(request.job.role, exact=True).first
    if not await role.count():
        run.update(status="failed", message="登录成功，但没有在官网找到目标岗位")
        return
    await role.click()
    await page.wait_for_timeout(500)
    apply_button = page.get_by_text("投递简历", exact=True).last
    if not await apply_button.count():
        run.update(status="failed", message="已找到岗位，但没有找到“投递简历”入口")
        return
    await apply_button.click()
    await page.wait_for_timeout(1200)

    form_probe = await application_form_probe(page)
    if form_probe is None:
        run.update(status="failed", message="已点击投递入口，但尚未进入可填写的申请表，请在 Harness 浏览器中检查页面")
        return

    filled, missing, resume_status = await fill_and_upload(run)
    run.result = f"已填写 {filled} 个基础字段；{resume_status}；资料库缺少：{', '.join(missing) if missing else '无'}。"
    run.update(status="review", step=3, message="自动填写已结束，请在 Harness 浏览器中检查；最终提交由你完成")


async def prepare_moka(run: ApplicationRun) -> None:
    assert run.page is not None
    page = run.page
    await page.goto(str(run.request.job.official_url), wait_until="domcontentloaded")
    run.update(status="running", step=1, message="正在打开 Moka 申请入口")
    apply_button = await moka_apply_button(page)
    if apply_button is None:
        await prepare_generic(run)
        return
    pages_before = set(page.context.pages)
    await apply_button.click()
    await page.wait_for_timeout(1000)
    new_pages = [candidate for candidate in page.context.pages if candidate not in pages_before]
    if new_pages:
        page = new_pages[-1]
        run.page = page
        await page.wait_for_load_state("domcontentloaded")

    form_probe = await application_form_probe(page)
    if form_probe is None:
        page, login_triggered = await trigger_login(page)
        run.page = page
        run.update(
            status="waiting_user", step=1,
            message=(
                "Moka 登录入口已为你打开。请完成手机号、扫码或验证码登录，再回到工作台点击“我已完成登录，开始填写”"
                if login_triggered else
                "请在 Harness 浏览器中完成 Moka 登录，再回到工作台点击“我已完成登录，开始填写”"
            ),
        )
        return

    run.update(status="running", step=2, message="已进入 Moka 申请表，正在智能填写")
    filled, missing, resume_status = await fill_and_upload(run)
    filled += await fill_known_options(page, run.request.profile)
    run.result = f"已填写 {filled} 个基础字段；{resume_status}；资料库缺少：{', '.join(missing) if missing else '无'}。"
    run.update(status="review", step=3, message="Moka 自动填写已结束，请检查未映射字段；最终提交由你完成")


async def resume_page(run: ApplicationRun) -> Page:
    """Follow user-opened job tabs, restricted to the original recruiting tenant."""
    assert run.context is not None and run.page is not None
    original = urlparse(str(run.request.job.official_url))
    def allowed(page: Page) -> bool:
        target = urlparse(page.url)
        if target.hostname == original.hostname:
            if target.hostname == "app.mokahr.com":
                return target.path.rstrip('/') == original.path.rstrip('/')
            return True
        return (original.hostname == "campus.fulltruckalliance.com"
                and target.hostname == "app.mokahr.com"
                and target.path.rstrip('/') == "/campus-recruitment/manbang/94191")

    candidates = [page for page in reversed(run.context.pages)
                  if not page.is_closed() and allowed(page)]
    for page in candidates:
        if await application_form_probe(page) is not None:
            return page
    for page in candidates:
        if re.search(r"(?:#|/)/?job/[^/]+", page.url):
            return page
    if candidates:
        return candidates[0]
    raise ValueError("未找到当前公司的招聘页面，请在任务打开的浏览器中进入岗位后再继续")


async def execute(run: ApplicationRun, *, resume: bool = False) -> None:
    hostname = urlparse(str(run.request.job.official_url)).hostname or ""
    try:
        run.update(status="running", message="正在启动本地浏览器")
        if run.context is None:
            profile_dir = RUNTIME_DIR / "browser-profiles" / run.id
            profile_dir.mkdir(parents=True, exist_ok=True)
            run.playwright = await async_playwright().start()
            run.context = await run.playwright.chromium.launch_persistent_context(str(profile_dir), headless=False)
            run.page = run.context.pages[0] if run.context.pages else await run.context.new_page()

        if resume:
            run.page = await resume_page(run)
            hostname = urlparse(run.page.url).hostname or ""
            run.update(message="已找到当前招聘页面，正在检查申请表", step=2)
            if await application_form_probe(run.page) is not None:
                await review_current_form(run, "已填写可确认字段，请检查并由你亲自点击最终提交")
                return
            entry = (await moka_apply_button(run.page) if hostname == "app.mokahr.com"
                     else await generic_apply_button(run.page))
            if entry is not None:
                run.page = await click_entry_and_follow(run.page, entry)
            if await application_form_probe(run.page) is None:
                run.page, login_triggered = await trigger_login(run.page)
                run.update(
                    status="waiting_user",
                    message=(
                        "新的登录入口已为你打开；请完成手机号、扫码或验证码登录后，再点击“我已完成登录，开始填写”"
                        if login_triggered else
                        "当前仍未进入申请表；请完成页面上的登录或岗位选择后，再点击“我已完成登录，开始填写”"
                    ),
                )
                return
            await review_current_form(run, "已填写可确认字段，请检查并由你亲自点击最终提交")
            return

        if hostname == "app.mokahr.com":
            await prepare_moka(run)
        elif hostname == "recruit.sinovatio.com":
            await prepare_sinovatio(run)
        else:
            await prepare_generic(run)
    except asyncio.CancelledError:
        run.update(status="closed", message="任务已关闭")
        raise
    except Exception as exc:
        run.result = str(exc)
        run.update(status="failed", message="Browser Harness 执行失败")


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok", "mode": "generic-with-adapters",
        "optimized_hosts": sorted(SUPPORTED_HOSTS), "unknown_hosts": "generic-probe",
    }


@app.get("/", include_in_schema=False)
async def browser_harness_home() -> RedirectResponse:
    return RedirectResponse("http://localhost:3001/#workflow", status_code=307)


@app.post("/applications", response_model=ApplicationView, status_code=202)
async def start_application(
    payload: str = Form(...),
    resume: UploadFile | None = File(default=None),
) -> ApplicationView:
    try:
        request = StartApplication.model_validate_json(payload)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="网申任务参数无效") from exc
    run = ApplicationRun(id=str(uuid4()), request=request)
    if resume is not None:
        filename = Path(resume.filename or "resume.pdf").name
        if not filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=415, detail="基础简历只支持 PDF")
        content = await resume.read(10 * 1024 * 1024 + 1)
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="简历文件不能超过 10 MB")
        upload_dir = RUNTIME_DIR / "uploads" / run.id
        upload_dir.mkdir(parents=True, exist_ok=True)
        run.resume_path = upload_dir / filename
        run.resume_path.write_bytes(content)
        run.resume_name = filename
    runs[run.id] = run
    run.task = asyncio.create_task(execute(run))
    return run.view()


@app.post("/applications/{run_id}/upload-resume", response_model=ApplicationView)
async def upload_resume(run_id: str) -> ApplicationView:
    run = runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="任务不存在")
    if not run.page or not run.resume_path or not run.resume_path.exists():
        raise HTTPException(status_code=409, detail="当前任务没有可上传的本地简历")
    if not await upload_resume_file(run.page, run.resume_path):
        raise HTTPException(status_code=409, detail="当前页面尚未找到简历上传入口")
    run.update(message="基础简历已上传到招聘页面，请检查文件名和页面字段；最终提交仍由你完成")
    return run.view()


@app.post("/applications/{run_id}/resume", response_model=ApplicationView, status_code=202)
async def resume_application(run_id: str, payload: ResumeApplication | None = None) -> ApplicationView:
    run = runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="任务不存在")
    if run.task and not run.task.done():
        raise HTTPException(status_code=409, detail="任务仍在运行")
    if payload is not None:
        run.request.profile = payload.profile
    run.result = None
    run.update(status="running", message="正在检查你登录后打开的岗位页面")
    run.task = asyncio.create_task(execute(run, resume=True))
    return run.view()


@app.get("/applications/{run_id}", response_model=ApplicationView)
async def get_application(run_id: str) -> ApplicationView:
    run = runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="任务不存在")
    return run.view()


async def close_run(run: ApplicationRun) -> None:
    if run.task and not run.task.done():
        run.task.cancel()
    if run.context:
        try:
            await run.context.close()
        except Exception:
            pass
        run.context = None
    if run.playwright:
        try:
            await run.playwright.stop()
        except Exception:
            pass
        run.playwright = None
    if run.resume_path and run.resume_path.exists():
        run.resume_path.unlink()
        try:
            run.resume_path.parent.rmdir()
        except OSError:
            pass
    run.update(status="closed", message="浏览器任务已关闭")


@app.delete("/applications/{run_id}", response_model=ApplicationView)
async def close_application(run_id: str) -> ApplicationView:
    run = runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="任务不存在")
    await close_run(run)
    return run.view()


@app.on_event("shutdown")
async def shutdown() -> None:
    for run in runs.values():
        await close_run(run)
