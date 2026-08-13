"use client";

import Fuse from "fuse.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, Clipboard, Code2, Download, FolderInput, FolderPlus, LogIn, LogOut, Menu, Moon, Pencil, Search, Settings2, ShieldCheck, SlidersHorizontal, Sun, Trash2, Upload, X } from "lucide-react";
import { categories, icons, type IconCategory, type IconData } from "./icon-data";

const sizes = [24, 40, 60] as const;
const weights = [1.2, 1.4, 1.8] as const;

function fileName(name: string) {
  return `deerma-${name.replace(/[\/\s]+/g, "-").toLowerCase()}`;
}

function svgAt(icon: IconData, size: number, weight: number) {
  return icon.svg
    .replace("<svg ", `<svg width="${size}" height="${size}" aria-hidden="true" `)
    .replace(/stroke-width="[^"]+"/g, `stroke-width="${weight}"`);
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function outlinedSvg(icon: IconData, size: number, weight: number) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden";
  host.innerHTML = svgAt(icon, size, weight);
  document.body.appendChild(host);
  const svg = host.querySelector("svg") as SVGSVGElement;
  const rootMatrix = svg.getScreenCTM()?.inverse();
  if (!rootMatrix) { host.remove(); return svgAt(icon, size, weight); }
  const outlined: SVGPathElement[] = [];
  svg.querySelectorAll("path[stroke]").forEach((path) => {
    const stroke = path.getAttribute("stroke");
    if (!stroke || stroke === "none") return;
    const originalD = path.getAttribute("d") || "";
    const subpaths = originalD.split(/(?=[Mm])/).filter(Boolean);
    for (const subpath of subpaths) {
      path.setAttribute("d", subpath);
      const length = path.getTotalLength();
      if (!length) continue;
      const count = Math.max(10, Math.ceil(length * 6));
      const matrix = path.getScreenCTM();
      if (!matrix) continue;
      const points = Array.from({ length: count + 1 }, (_, index) => path.getPointAtLength(length * index / count).matrixTransform(matrix));
      const closed = /z\s*$/i.test(subpath) || Math.hypot(points[0].x - points[count].x, points[0].y - points[count].y) < .15;
      const half = weight / 2;
      const left: DOMPoint[] = [], right: DOMPoint[] = [];
      points.forEach((point, index) => {
        const before = points[index === 0 ? (closed ? count - 1 : 0) : index - 1];
        const after = points[index === count ? (closed ? 1 : count) : index + 1];
        const dx = after.x - before.x, dy = after.y - before.y;
        const scale = half / (Math.hypot(dx, dy) || 1);
        left.push(new DOMPoint(point.x - dy * scale, point.y + dx * scale));
        right.push(new DOMPoint(point.x + dy * scale, point.y - dx * scale));
      });
      const addOutline = (screenPoints: DOMPoint[]) => {
        const rootPoints = screenPoints.map((point) => point.matrixTransform(rootMatrix));
        const outline = document.createElementNS("http://www.w3.org/2000/svg", "path");
        outline.setAttribute("d", rootPoints.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(3)} ${point.y.toFixed(3)}`).join("") + "Z");
        outline.setAttribute("fill", stroke);
        outlined.push(outline);
      };
      addOutline([...left, ...right.reverse()]);
      if (!closed) {
        for (const center of [points[0], points[count]]) {
          addOutline(Array.from({ length: 24 }, (_, index) => {
            const angle = Math.PI * 2 * index / 24;
            return new DOMPoint(center.x + Math.cos(angle) * half, center.y + Math.sin(angle) * half);
          }));
        }
      }
    }
    path.setAttribute("d", originalD);
    path.removeAttribute("stroke"); path.removeAttribute("stroke-width"); path.removeAttribute("stroke-linecap"); path.removeAttribute("stroke-linejoin"); path.removeAttribute("vector-effect");
    if (path.getAttribute("fill") === "none") path.remove();
  });
  outlined.forEach((path) => svg.appendChild(path));
  svg.removeAttribute("width"); svg.removeAttribute("height");
  const output = svg.outerHTML;
  host.remove();
  return output;
}

export function IconLibrary({ staticMode = false }: { staticMode?: boolean } = {}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [size, setSize] = useState<(typeof sizes)[number]>(24);
  const [weight, setWeight] = useState<(typeof weights)[number]>(1.4);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [page, setPage] = useState<"library" | "guidelines">("library");
  const [mobileFilters, setMobileFilters] = useState(false);
  const [copied, setCopied] = useState("");
  const [customIcons, setCustomIcons] = useState<IconData[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<IconCategory>(categories[0]);
  const [uploadFiles, setUploadFiles] = useState<{ name: string; svg: string }[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [deleteMode, setDeleteMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, IconCategory>>({});
  const [moveCategory, setMoveCategory] = useState<IconCategory>(categories[0]);
  const [categoryList, setCategoryList] = useState<string[]>([...categories]);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [role, setRole] = useState<"loading" | "viewer" | "admin">(staticMode ? "viewer" : "loading");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const copyTimer = useRef<number | null>(null);
  const selectionAnchor = useRef<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("deerma-theme");
    const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(dark ? "dark" : "light");
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      const savedIcons = JSON.parse(localStorage.getItem("deerma-custom-icons") || "[]");
      if (Array.isArray(savedIcons)) setCustomIcons(savedIcons.filter((icon) => icon?.id && icon?.name && icon?.svg && typeof icon.category === "string"));
    } catch {}
    try {
      const removed = JSON.parse(localStorage.getItem("deerma-deleted-icons") || "[]");
      if (Array.isArray(removed)) setDeletedIds(removed.filter((id) => typeof id === "string"));
    } catch {}
    try {
      const overrides = JSON.parse(localStorage.getItem("deerma-icon-categories") || "{}");
      if (overrides && typeof overrides === "object") setCategoryOverrides(Object.fromEntries(Object.entries(overrides).filter(([, category]) => typeof category === "string")) as Record<string, IconCategory>);
    } catch {}
    try {
      const savedCategories = JSON.parse(localStorage.getItem("deerma-category-list") || "[]");
      if (Array.isArray(savedCategories) && savedCategories.length) setCategoryList(savedCategories.filter((name, index) => typeof name === "string" && name.trim() && savedCategories.indexOf(name) === index));
    } catch {}
  }, []);

  useEffect(() => {
    if (staticMode) { setRole("viewer"); return; }
    fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setRole(data.(!staticMode && role === "admin") ? "admin" : "viewer"))
      .catch(() => setRole("viewer"));
  }, [staticMode]);

  useEffect(() => {
    const closeMenu = () => setActiveMenuId(null);
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);

  const allIcons = useMemo(() => [...customIcons, ...icons].filter((icon) => !deletedIds.includes(icon.id)).map((icon) => categoryOverrides[icon.id] ? { ...icon, category: categoryOverrides[icon.id] } : icon), [customIcons, deletedIds, categoryOverrides]);
  const counts = useMemo(() => Object.fromEntries(categoryList.map((category) => [category, allIcons.filter((icon) => icon.category === category).length])), [allIcons, categoryList]);
  const fuse = useMemo(() => new Fuse(allIcons, { keys: ["name", "category", "tags"], threshold: 0.35, ignoreLocation: true }), [allIcons]);
  const results = useMemo(() => {
    const searched = query.trim() ? fuse.search(query).map(({ item }) => item) : allIcons;
    return selected ? searched.filter((icon) => icon.category === selected) : searched;
  }, [allIcons, fuse, query, selected]);

  async function readUploads(files: FileList | null) {
    setUploadError("");
    const selectedFiles = Array.from(files ?? []).slice(0, 50);
    const accepted: { name: string; svg: string }[] = [];
    for (const file of selectedFiles) {
      if (!file.name.toLowerCase().endsWith(".svg") || file.size > 500_000) continue;
      const documentNode = new DOMParser().parseFromString(await file.text(), "image/svg+xml");
      const svg = documentNode.querySelector("svg");
      if (!svg || documentNode.querySelector("parsererror")) continue;
      svg.querySelectorAll("script,foreignObject,iframe,object,embed,image").forEach((node) => node.remove());
      svg.querySelectorAll("*").forEach((node) => Array.from(node.attributes).forEach((attribute) => {
        if (/^on/i.test(attribute.name) || /^(href|xlink:href)$/i.test(attribute.name)) node.removeAttribute(attribute.name);
      }));
      if (!svg.getAttribute("viewBox")) {
        const width = Number.parseFloat(svg.getAttribute("width") || "24");
        const height = Number.parseFloat(svg.getAttribute("height") || "24");
        svg.setAttribute("viewBox", `0 0 ${Number.isFinite(width) ? width : 24} ${Number.isFinite(height) ? height : 24}`);
      }
      svg.removeAttribute("width"); svg.removeAttribute("height"); svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      accepted.push({ name: file.name.replace(/\.svg$/i, ""), svg: svg.outerHTML });
    }
    setUploadFiles(accepted);
    if (!accepted.length) setUploadError("未读取到有效 SVG。单个文件需小于 500KB。 ");
  }

  function addUploads() {
    if (role !== "admin") return;
    const stamp = Date.now();
    const added: IconData[] = uploadFiles.map((file, index) => ({ id: `custom-${stamp}-${index}`, name: file.name, category: uploadCategory, tags: [file.name, uploadCategory, "自定义", "可编辑"], svg: file.svg }));
    const next = [...added, ...customIcons];
    setCustomIcons(next);
    localStorage.setItem("deerma-custom-icons", JSON.stringify(next));
    setSelected(uploadCategory); setUploadFiles([]); setUploadOpen(false); setPage("library");
  }

  function toggleChecked(id: string, shiftKey = false) {
    const anchorIndex = selectionAnchor.current ? results.findIndex((icon) => icon.id === selectionAnchor.current) : -1;
    const currentIndex = results.findIndex((icon) => icon.id === id);
    if (shiftKey && anchorIndex >= 0 && currentIndex >= 0) {
      const [start, end] = anchorIndex < currentIndex ? [anchorIndex, currentIndex] : [currentIndex, anchorIndex];
      const rangeIds = results.slice(start, end + 1).map((icon) => icon.id);
      setCheckedIds((current) => [...new Set([...current, ...rangeIds])]);
    } else {
      setCheckedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    }
    selectionAnchor.current = id;
  }

  function moveChecked() {
    if (role !== "admin") return;
    if (!checkedIds.length) return;
    const next = { ...categoryOverrides };
    checkedIds.forEach((id) => { next[id] = moveCategory; });
    setCategoryOverrides(next);
    localStorage.setItem("deerma-icon-categories", JSON.stringify(next));
    setCheckedIds([]);
    selectionAnchor.current = null;
  }

  function deleteChecked() {
    if (role !== "admin") return;
    if (!checkedIds.length || !window.confirm(`确定删除选中的 ${checkedIds.length} 个图标吗？`)) return;
    const nextDeleted = [...new Set([...deletedIds, ...checkedIds])];
    const nextCustom = customIcons.filter((icon) => !checkedIds.includes(icon.id));
    setDeletedIds(nextDeleted); setCustomIcons(nextCustom); setCheckedIds([]); setDeleteMode(false);
    localStorage.setItem("deerma-deleted-icons", JSON.stringify(nextDeleted));
    localStorage.setItem("deerma-custom-icons", JSON.stringify(nextCustom));
  }

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("deerma-theme", next);
    document.documentElement.dataset.theme = next;
  }

  function toggleCategory(category: string) {
    setSelected((current) => current === category ? null : category);
  }

  function saveCategoryList(next: string[]) {
    setCategoryList(next);
    localStorage.setItem("deerma-category-list", JSON.stringify(next));
    if (!next.includes(uploadCategory)) setUploadCategory(next[0] || "");
    if (!next.includes(moveCategory)) setMoveCategory(next[0] || "");
  }

  function addCategory() {
    if (role !== "admin") return;
    const name = newCategoryName.trim();
    if (!name || categoryList.includes(name)) return;
    saveCategoryList([...categoryList, name]); setNewCategoryName("");
  }

  function renameCategory(category: string) {
    if (role !== "admin") return;
    const name = editingCategoryName.trim();
    if (!name || (name !== category && categoryList.includes(name))) return;
    const nextOverrides = { ...categoryOverrides };
    allIcons.filter((icon) => icon.category === category).forEach((icon) => { nextOverrides[icon.id] = name; });
    setCategoryOverrides(nextOverrides); localStorage.setItem("deerma-icon-categories", JSON.stringify(nextOverrides));
    saveCategoryList(categoryList.map((item) => item === category ? name : item));
    if (selected === category) setSelected(name);
    setEditingCategory(null); setEditingCategoryName("");
  }

  function moveCategoryOrder(category: string, direction: -1 | 1) {
    if (role !== "admin") return;
    const index = categoryList.indexOf(category); const target = index + direction;
    if (index < 0 || target < 0 || target >= categoryList.length) return;
    const next = [...categoryList]; [next[index], next[target]] = [next[target], next[index]]; saveCategoryList(next);
  }

  function deleteCategory(category: string) {
    if (role !== "admin" || categoryList.length < 2) return;
    const fallback = categoryList.find((item) => item !== category) || "";
    const count = counts[category] || 0;
    const target = count ? window.prompt(`“${category}”中有 ${count} 个图标。请输入要迁移到的分类名称：`, fallback)?.trim() : fallback;
    if (count && (!target || target === category || !categoryList.includes(target))) { window.alert("请输入现有的其他分类名称。"); return; }
    if (!window.confirm(count ? `确认将 ${count} 个图标迁移到“${target}”并删除“${category}”吗？` : `确认删除空分类“${category}”吗？`)) return;
    const nextOverrides = { ...categoryOverrides };
    if (count && target) allIcons.filter((icon) => icon.category === category).forEach((icon) => { nextOverrides[icon.id] = target; });
    setCategoryOverrides(nextOverrides); localStorage.setItem("deerma-icon-categories", JSON.stringify(nextOverrides));
    saveCategoryList(categoryList.filter((item) => item !== category));
    if (selected === category) setSelected(null);
  }

  async function loginAdmin(event: React.FormEvent) {
    event.preventDefault();
    setLoginPending(true); setLoginError("");
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(loginForm) });
    const data = await response.json().catch(() => ({}));
    setLoginPending(false);
    if (!response.ok) { setLoginError(data.error || "登录失败，请稍后重试"); return; }
    setRole("admin"); setLoginOpen(false); setLoginForm({ username: "", password: "" });
  }

  async function logoutAdmin() {
    if (!window.confirm("确定退出管理员账号吗？退出后将切换为普通用户权限。")) return;
    await fetch("/api/admin/logout", { method: "POST" });
    setRole("viewer"); setDeleteMode(false); setCheckedIds([]); setUploadOpen(false);
  }

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(""), 1800);
  }

  function downloadSvg(icon: IconData) {
    downloadBlob(new Blob([svgAt(icon, size, weight)], { type: "image/svg+xml" }), `${fileName(icon.name)}-editable.svg`);
  }

  function downloadOutlined(icon: IconData) {
    downloadBlob(new Blob([outlinedSvg(icon, size, weight)], { type: "image/svg+xml" }), `${fileName(icon.name)}-${size}px-outlined.svg`);
  }

  function downloadPng(icon: IconData) {
    const image = new Image();
    const blob = new Blob([svgAt(icon, size * 4, weight)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size * 4;
      canvas.height = size * 4;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(image, 0, 0);
      canvas.toBlob((png) => png && downloadBlob(png, `${fileName(icon.name)}@4x.png`), "image/png");
      URL.revokeObjectURL(url);
    };
    image.src = url;
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => setPage("library")} aria-label="打开图标库首页">
          <span className="brand-mark">D</span><span>DEERMA ICONS</span><span className="version-badge">V1.0.3</span>
        </button>
        <nav className="header-nav" aria-label="主导航">
          <button className={page === "library" ? "active" : ""} onClick={() => setPage("library")}>图标库</button>
        </nav>
        <div className="header-actions">
          {(!staticMode && role === "admin") && <button className="upload-button" onClick={() => setUploadOpen(true)}><Upload/> 上传图标</button>}
          {(!staticMode && role === "admin") ? <button className="permission-button admin" onClick={logoutAdmin} title="退出管理模式"><ShieldCheck/><span>管理员</span><LogOut/></button> : <button className="permission-button" onClick={() => setLoginOpen(true)} disabled={role === "loading"}><LogIn/><span>{role === "loading" ? "权限检查中" : "管理员登录"}</span></button>}
          <button className="icon-button" onClick={toggleTheme} aria-label={theme === "light" ? "切换到深色主题" : "切换到浅色主题"}>{theme === "light" ? <Moon/> : <Sun/>}</button>
        </div>
      </header>

      {page === "guidelines" ? <Guidelines onBack={() => setPage("library")}/> : (
        <div className="workspace">
          <aside className={`sidebar ${mobileFilters ? "open" : ""}`}>
            <div className="sidebar-title"><span>图标分类</span><div>{(!staticMode && role === "admin") && <button className="category-settings" onClick={() => setCategoryManagerOpen(true)} aria-label="管理图标分类" title="管理分类"><Settings2/></button>}<button onClick={() => setMobileFilters(false)} aria-label="关闭筛选"><X/></button></div></div>
            <button className={`category-row ${selected === null ? "selected" : ""}`} onClick={() => setSelected(null)}><span>全部图标</span><b>{allIcons.length}</b></button>
            {categoryList.map((category) => <button key={category} aria-pressed={selected === category} className={`category-row ${selected === category ? "selected" : ""}`} onClick={() => toggleCategory(category)}><span>{category}</span><b>{counts[category] || 0}</b></button>)}
          </aside>

          <main className="main-content">
            <section className="intro">
              <p className="eyebrow">DEERMA DESIGN SYSTEM</p>
              <h1>图标库</h1>
              <p>统一、清晰、可扩展的德尔玛产品图标资产。搜索、预览并直接复制到你的项目中。</p>
            </section>

            <div className="sticky-library-tools">
              <div className="control-bar">
                <label className="search-box"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索图标名称或标签…" aria-label="搜索图标"/>{query && <button onClick={() => setQuery("")} aria-label="清空搜索"><X/></button>}</label>
                <button className="filter-button" onClick={() => setMobileFilters(true)}><Menu/> 分类筛选</button>
                <div className="size-control" aria-label="图标尺寸">{sizes.map((value) => <button key={value} className={size === value ? "active" : ""} onClick={() => setSize(value)}>{value}</button>)}</div>
                <div className="stroke-control" aria-label="视觉粗细"><SlidersHorizontal/><span>视觉粗细</span>{weights.map((value) => <button key={value} className={weight === value ? "active" : ""} onClick={() => setWeight(value)}>{value}</button>)}</div>
              </div>
              <div className="result-meta"><strong>{results.length} 个图标</strong><span>可编辑 SVG · {size}px / {weight}px 描边</span>{selected && <button onClick={() => setSelected(null)}>清除筛选 <X/></button>}{(!staticMode && role === "admin") && <button className={deleteMode ? "delete-active" : ""} onClick={() => { setDeleteMode((current) => !current); setCheckedIds([]); }}><Trash2/> {deleteMode ? "退出删除" : "批量删除"}</button>}</div>
              {(!staticMode && role === "admin") && deleteMode && <div className="delete-toolbar"><label><input type="checkbox" checked={results.length > 0 && results.every((icon) => checkedIds.includes(icon.id))} onChange={(event) => { setCheckedIds(event.target.checked ? results.map((icon) => icon.id) : []); selectionAnchor.current = event.target.checked ? results[0]?.id ?? null : null; }}/> 全选当前结果</label><span>已选择 {checkedIds.length} 个 · 按住 Shift 可连续选择</span><div className="move-control"><select aria-label="目标分组" value={moveCategory} onChange={(event) => setMoveCategory(event.target.value as IconCategory)}>{categoryList.map((category) => <option key={category}>{category}</option>)}</select><button className="move-button" disabled={!checkedIds.length} onClick={moveChecked}><FolderInput/> 移动到分组</button></div><button disabled={!checkedIds.length} onClick={deleteChecked}><Trash2/> 删除所选</button></div>}
            </div>
            {results.length ? <div className="icon-grid">{results.map((icon) => <IconCard key={icon.id} icon={icon} size={size} weight={weight} copied={copied} copy={copy} downloadSvg={downloadSvg} downloadPng={downloadPng} deleteMode={deleteMode} checked={checkedIds.includes(icon.id)} toggleChecked={toggleChecked} menuOpen={activeMenuId === icon.id} toggleMenu={() => setActiveMenuId((current) => current === icon.id ? null : icon.id)} closeMenu={() => setActiveMenuId(null)}/>)}</div> : <div className="empty-state"><Search/><h2>没有找到匹配图标</h2><p>试试更短的关键词，或清除分类筛选。</p><button onClick={() => {setQuery(""); setSelected(null);}}>重置筛选</button></div>}
          </main>
        </div>
      )}
      <footer><span>Deerma Design System</span><span>{allIcons.length} 个可编辑图标 · WCAG 2.1 AA</span><span>V1.0.3</span></footer>
      {copied && <div className="copy-toast" role="status" aria-live="polite"><Check/><span>已复制 {copied.endsWith("-jsx") ? "JSX" : "SVG"}</span></div>}
      {loginOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setLoginOpen(false)}>
        <form className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title" onSubmit={loginAdmin}>
          <div className="upload-head"><div><p className="eyebrow">ADMIN ACCESS</p><h2 id="login-title">管理员登录</h2></div><button type="button" className="icon-button" onClick={() => setLoginOpen(false)} aria-label="关闭登录窗口"><X/></button></div>
          <p className="upload-description">普通用户可查看、复制和下载；登录后可上传、移动分组和删除图标。</p>
          <label className="login-field">管理员账号<input autoFocus autoComplete="username" value={loginForm.username} onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}/></label>
          <label className="login-field">密码<input type="password" autoComplete="current-password" value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}/></label>
          {loginError && <p className="upload-error" role="alert">{loginError}</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setLoginOpen(false)}>取消</button><button className="primary-button" disabled={loginPending || !loginForm.username || !loginForm.password}>{loginPending ? "登录中…" : "登录"}</button></div>
        </form>
      </div>}
      {(!staticMode && role === "admin") && categoryManagerOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCategoryManagerOpen(false)}>
        <section className="category-modal" role="dialog" aria-modal="true" aria-labelledby="category-title">
          <div className="upload-head"><div><p className="eyebrow">CATEGORY MANAGEMENT</p><h2 id="category-title">图标分类管理</h2></div><button className="icon-button" onClick={() => setCategoryManagerOpen(false)} aria-label="关闭分类管理"><X/></button></div>
          <p className="upload-description">新增、重命名或调整分类顺序。删除非空分类时，需要先把其中图标迁移到其他分类。</p>
          <form className="category-create" onSubmit={(event) => { event.preventDefault(); addCategory(); }}><input aria-label="新分类名称" placeholder="输入新分类名称" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)}/><button disabled={!newCategoryName.trim() || categoryList.includes(newCategoryName.trim())}><FolderPlus/>新增分类</button></form>
          <div className="category-manage-list">{categoryList.map((category, index) => <div className="category-manage-row" key={category}>{editingCategory === category ? <form className="category-rename" onSubmit={(event) => { event.preventDefault(); renameCategory(category); }}><input autoFocus aria-label={`修改${category}分类名称`} value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)}/><button aria-label="保存分类名称"><Check/></button><button type="button" aria-label="取消修改" onClick={() => setEditingCategory(null)}><X/></button></form> : <><span><strong>{category}</strong><small>{counts[category] || 0} 个图标</small></span><div className="category-row-actions"><button disabled={index === 0} onClick={() => moveCategoryOrder(category, -1)} aria-label={`${category}上移`}><ArrowUp/></button><button disabled={index === categoryList.length - 1} onClick={() => moveCategoryOrder(category, 1)} aria-label={`${category}下移`}><ArrowDown/></button><button onClick={() => { setEditingCategory(category); setEditingCategoryName(category); }} aria-label={`重命名${category}`}><Pencil/></button><button className="danger" disabled={categoryList.length < 2} onClick={() => deleteCategory(category)} aria-label={`删除${category}`}><Trash2/></button></div></>}</div>)}</div>
        </section>
      </div>}
      {(!staticMode && role === "admin") && uploadOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setUploadOpen(false)}>
        <section className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title">
          <div className="upload-head"><div><p className="eyebrow">LOCAL ICON IMPORT</p><h2 id="upload-title">上传可编辑图标</h2></div><button className="icon-button" onClick={() => setUploadOpen(false)} aria-label="关闭上传窗口"><X/></button></div>
          <p className="upload-description">支持一次上传多个 SVG。文件会保存在当前浏览器中，不会上传到服务器。</p>
          <label className="field-label">存入分类<select value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value as IconCategory)}>{categoryList.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="upload-dropzone"><Upload/><strong>选择 SVG 文件</strong><span>最多 50 个，单个不超过 500KB</span><input type="file" accept=".svg,image/svg+xml" multiple onChange={(event) => readUploads(event.target.files)}/></label>
          {uploadError && <p className="upload-error" role="alert">{uploadError}</p>}
          {uploadFiles.length > 0 && <div className="upload-preview-section"><div className="upload-preview-title"><strong>实时预览</strong><span>{uploadFiles.length} 个 SVG</span></div><div className="upload-list">{uploadFiles.map((file, index) => <article className="upload-preview-card" key={`${file.name}-${index}`}><div className="upload-preview-image" aria-label={`${file.name}预览`} dangerouslySetInnerHTML={{ __html: file.svg }}/><div className="upload-preview-meta"><span title={file.name}>{file.name}</span><button onClick={() => setUploadFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除 ${file.name}`}><X/></button></div></article>)}</div></div>}
          <div className="modal-actions"><button className="secondary-button" onClick={() => setUploadOpen(false)}>取消</button><button className="primary-button" disabled={!uploadFiles.length} onClick={addUploads}>添加 {uploadFiles.length || ""} 个图标</button></div>
        </section>
      </div>}
    </div>
  );
}

function IconCard({ icon, size, weight, copied, copy, downloadSvg, downloadPng, deleteMode, checked, toggleChecked, menuOpen, toggleMenu, closeMenu }: { icon: IconData; size: number; weight: number; copied: string; copy: (text: string, id: string) => void; downloadSvg: (icon: IconData) => void; downloadPng: (icon: IconData) => void; deleteMode: boolean; checked: boolean; toggleChecked: (id: string, shiftKey?: boolean) => void; menuOpen: boolean; toggleMenu: () => void; closeMenu: () => void }) {
  const renderedSvg = svgAt(icon, size, weight);
  const jsx = renderedSvg.replace(/<svg[^>]*>/, `<svg viewBox="0 0 24 24" aria-hidden="true">`).replace(/class=/g, "className=").replace(/stroke-width=/g, "strokeWidth=").replace(/stroke-linecap=/g, "strokeLinecap=").replace(/stroke-linejoin=/g, "strokeLinejoin=").replace(/vector-effect=/g, "vectorEffect=").replace(/fill-rule=/g, "fillRule=").replace(/clip-rule=/g, "clipRule=");
  return <article className={`icon-card ${checked ? "checked" : ""}`}>
    {deleteMode && <button className="card-check" aria-label={`${checked ? "取消选择" : "选择"}${icon.name}`} aria-pressed={checked} onClick={(event) => toggleChecked(icon.id, event.shiftKey)}>{checked && <Check/>}</button>}
    <div className="icon-preview"><div style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: renderedSvg }}/></div>
    <div className="icon-info"><div><h2>{icon.name}</h2><p>{icon.category}</p></div><div className="icon-info-actions" onPointerDown={(event) => event.stopPropagation()}><button className="more-button" aria-label={`${icon.name}操作菜单`} aria-expanded={menuOpen} onClick={toggleMenu}><ChevronDown/></button></div></div>
    {menuOpen && <div className="card-menu" onPointerDown={(event) => event.stopPropagation()}>
      <button onClick={() => { copy(renderedSvg, `${icon.id}-svg`); closeMenu(); }}><Clipboard/>复制 SVG</button>
      <button onClick={() => { copy(jsx, `${icon.id}-jsx`); closeMenu(); }}><Code2/>复制 JSX</button>
      <button onClick={() => { downloadPng(icon); closeMenu(); }}><Download/>下载 PNG</button>
      <button onClick={() => { downloadSvg(icon); closeMenu(); }}><Download/>下载 SVG</button>
    </div>}
    <div className="card-actions">
      <button onClick={() => copy(renderedSvg, `${icon.id}-svg`)}>{copied === `${icon.id}-svg` ? <Check/> : <Clipboard/>}<span>{copied === `${icon.id}-svg` ? "已复制" : "SVG"}</span></button>
      <button onClick={() => copy(jsx, `${icon.id}-jsx`)}>{copied === `${icon.id}-jsx` ? <Check/> : <Code2/>}<span>JSX</span></button>
      <button onClick={() => downloadPng(icon)}><Download/><span>PNG</span></button>
      <button onClick={() => downloadSvg(icon)}><Download/><span>SVG</span></button>
    </div>
  </article>;
}

function Guidelines({ onBack }: { onBack: () => void }) {
  return <main className="guidelines">
    <button className="back-link" onClick={onBack}>← 返回图标库</button>
    <p className="eyebrow">DEERMA ICON GUIDELINES</p><h1>图标使用规范</h1><p className="guidelines-lead">让每一个图标在不同尺寸、设备与使用场景中都保持一致、清晰且易于理解。</p>
    <section className="guideline-grid"><article><span className="step">01</span><h2>基础规格</h2><p>所有图标基于 24×24 网格构建，保留 2px 安全边距。推荐使用 16、24 或 40px。</p><div className="spec-demo"><div className="grid-icon">D</div><code>viewBox=&quot;0 0 24 24&quot;</code></div></article><article><span className="step">02</span><h2>颜色与对比度</h2><p>图标应继承文本色。交互图标与背景至少达到 3:1 对比度，关键信息达到 4.5:1。</p><div className="swatches"><i/><i/><i/><i/></div></article><article><span className="step">03</span><h2>无障碍</h2><p>纯装饰图标添加 aria-hidden。独立操作按钮必须提供清晰的 aria-label，并保证 44px 触控区域。</p><code className="code-block">{`<button aria-label="开始清洁">\n  <CleanIcon aria-hidden="true" />\n</button>`}</code></article><article><span className="step">04</span><h2>React 使用</h2><p>复制 JSX 后可直接放入组件。通过 currentColor 统一跟随主题或父级文字颜色。</p><code className="code-block">{`<DeermaIcon\n  size={24}\n  className="text-primary"\n/>`}</code></article></section>
    <section className="do-dont"><div><b>推荐</b><h2>保持清晰与一致</h2><p>使用标准尺寸、整数坐标与高对比色；同一区域内保持一致的视觉粗细。</p></div><div><b>避免</b><h2>随意拉伸或装饰</h2><p>不要非等比缩放、添加投影、描边或多余颜色，也不要仅靠图标传递关键含义。</p></div></section>
  </main>;
}
