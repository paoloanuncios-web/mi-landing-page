/* TopFeed Pro — estilos del panel (se aplican dentro de un Shadow DOM). */
globalThis.TF_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.tf { --bg:#0f0d17; --panel:#17141f; --card:#1f1b2b; --line:#2e2840; --text:#ece9f5; --muted:#9a93ad;
  --accent:#8b5cf6; --accent2:#ec4899; --ok:#22c55e; --warn:#f59e0b; --hot:#f97316;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--text); }
button, select, input, textarea { font: inherit; color: inherit; }
.launcher { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border: 0; border-radius: 999px; cursor: pointer; color: #fff; font-weight: 700;
  background: linear-gradient(135deg, var(--accent), var(--accent2)); box-shadow: 0 6px 24px rgba(139,92,246,.45); }
.launcher .count { background: rgba(0,0,0,.25); border-radius: 999px; padding: 1px 8px; font-size: 12px; }
.launcher.hidden { display: none; }
.overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(5,4,10,.6); display: none; }
.overlay.open { display: block; }
.panel { position: absolute; inset: 2.5vh 2.5vw; background: var(--bg); border: 1px solid var(--line); border-radius: 16px;
  display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 80px rgba(0,0,0,.6); }
.head { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--panel); flex-wrap: wrap; }
.logo { font-weight: 800; font-size: 16px; background: linear-gradient(135deg, var(--accent), var(--accent2));
  -webkit-background-clip: text; background-clip: text; color: transparent; white-space: nowrap; }
.profile { display: flex; align-items: center; gap: 8px; min-width: 0; }
.profile img { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; }
.profile .h { font-weight: 700; }
.profile .s { color: var(--muted); font-size: 12px; }
.spacer { flex: 1; }
.head select { background: var(--card); border: 1px solid var(--line); border-radius: 9px; padding: 7px 8px; }
.btn { border: 1px solid var(--line); background: var(--card); padding: 7px 11px; border-radius: 9px; cursor: pointer; white-space: nowrap; }
.btn:hover { border-color: var(--accent); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.btn.danger:hover { border-color: #ef4444; }
.btn.sm { padding: 4px 8px; font-size: 12px; border-radius: 7px; }
.btn:disabled { opacity: .5; cursor: default; }
.menu { position: relative; display: inline-block; }
.menu .items { display: none; position: absolute; right: 0; top: calc(100% + 4px); background: var(--panel); border: 1px solid var(--line);
  border-radius: 10px; padding: 4px; min-width: 210px; z-index: 5; }
.menu.open .items { display: block; }
.menu .items button { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 8px 10px; border-radius: 7px; cursor: pointer; }
.menu .items button:hover { background: var(--card); }
.bar { display: flex; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; align-items: center; }
.bar label { color: var(--muted); font-size: 12px; display: flex; align-items: center; gap: 5px; }
.bar select, .bar input { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
.bar input[type=number] { width: 90px; }
.bar input[type=search] { width: 170px; }
.tabs { display: flex; gap: 4px; padding: 8px 16px 0; border-bottom: 1px solid var(--line); }
.tab { background: none; border: 0; padding: 8px 12px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; }
.tab.on { color: var(--text); border-bottom-color: var(--accent); font-weight: 600; }
.body { flex: 1; overflow: auto; padding: 16px; }
.status { color: var(--muted); font-size: 12px; padding: 8px 16px; display: flex; gap: 12px; flex-wrap: wrap; }
.status b { color: var(--text); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
.card { position: relative; background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
.card.sel { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.thumb { position: relative; aspect-ratio: 9/12; background: #000; display: block; }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb .noimg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--muted); padding: 10px; text-align: center; }
.rank { position: absolute; left: 8px; top: 8px; background: rgba(0,0,0,.7); border-radius: 7px; padding: 2px 7px; font-weight: 800; }
.chip { position: absolute; right: 8px; top: 8px; border-radius: 7px; padding: 2px 7px; font-weight: 700; font-size: 12px; background: rgba(0,0,0,.7); }
.chip.hot { background: var(--hot); color: #fff; }
.typ { position: absolute; left: 8px; bottom: 8px; background: rgba(0,0,0,.7); border-radius: 7px; padding: 2px 7px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.pin { position: absolute; right: 8px; bottom: 8px; background: rgba(0,0,0,.7); border-radius: 7px; padding: 2px 7px; font-size: 11px; }
.selbox { position: absolute; left: 8px; top: 38px; width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; }
.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 8px; }
.m { background: var(--panel); border-radius: 7px; padding: 4px 6px; }
.m .k { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
.m .v { font-weight: 700; }
.m.main .v { color: #c4b5fd; }
.cap { padding: 0 8px; color: var(--muted); font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 32px; }
.meta { padding: 6px 8px; color: var(--muted); font-size: 11px; display: flex; justify-content: space-between; gap: 6px; }
.actions { display: flex; gap: 4px; padding: 0 8px 8px; flex-wrap: wrap; }
.grow { color: var(--ok); font-weight: 700; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { padding: 7px 8px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
th { position: sticky; top: -16px; background: var(--bg); cursor: pointer; color: var(--muted); font-weight: 600; user-select: none; }
th.on { color: var(--text); }
td.l, th.l { text-align: left; }
td.cap2 { text-align: left; max-width: 340px; overflow: hidden; text-overflow: ellipsis; color: var(--muted); }
td img { width: 36px; height: 48px; object-fit: cover; border-radius: 5px; display: block; }
a { color: #c4b5fd; text-decoration: none; }
a:hover { text-decoration: underline; }
.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-bottom: 18px; }
.kpi { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
.kpi .k { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.kpi .v { font-size: 20px; font-weight: 800; margin-top: 2px; }
.kpi .s { color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
.sec { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-bottom: 14px; }
.sec h3 { margin: 0 0 4px; font-size: 14px; }
.sec .sub { color: var(--muted); font-size: 12px; margin-bottom: 10px; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; }
.cols .sec { margin-bottom: 0; }
svg text { fill: var(--muted); font-size: 10px; }
svg .val { fill: var(--text); font-weight: 700; }
.hooks li { margin-bottom: 8px; }
.hooks .n { color: #c4b5fd; font-weight: 700; margin-right: 6px; }
.empty { text-align: center; color: var(--muted); padding: 60px 20px; }
.empty h2 { color: var(--text); margin: 0 0 8px; }
.empty ol { text-align: left; display: inline-block; }
.toast { position: fixed; left: 50%; bottom: 30px; transform: translateX(-50%); background: var(--panel); border: 1px solid var(--accent);
  padding: 10px 16px; border-radius: 10px; z-index: 2147483647; display: none; color: var(--text); max-width: 80vw; }
.toast.on { display: block; }
.modal { position: absolute; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 10; }
.modal .box { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; width: min(720px, 92%); max-height: 80%; display: flex; flex-direction: column; }
.modal .box .t { padding: 12px 14px; border-bottom: 1px solid var(--line); font-weight: 700; display: flex; justify-content: space-between; align-items: center; }
.modal .box .c { padding: 14px; overflow: auto; white-space: pre-wrap; }
.modal .box .pc { display: flex; justify-content: center; background: #000; padding: 0; }
.player { width: 100%; max-height: 70vh; aspect-ratio: 16/9; border: 0; background: #000; }
video.player { aspect-ratio: auto; }
.actions .menu .items { right: auto; left: 0; bottom: calc(100% + 4px); top: auto; }
.ai textarea { width: 100%; min-height: 70px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 10px; resize: vertical; }
.md h1, .md h2, .md h3 { font-size: 15px; margin: 16px 0 6px; color: #c4b5fd; }
.md p { margin: 6px 0; } .md ul, .md ol { margin: 6px 0; padding-left: 20px; }
.hist { display: flex; flex-direction: column; gap: 8px; }
.hist .row { display: flex; align-items: center; gap: 10px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; flex-wrap: wrap; }
.hist .row .i { flex: 1; min-width: 200px; }
.muted { color: var(--muted); }
.progress { height: 4px; background: var(--line); }
.progress > div { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); width: 0; transition: width .3s; }
`;
