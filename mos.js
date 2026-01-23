// mos.js (VC subjective test: Naturalness + Similarity, 5-point each)

// ---------- utils ----------
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// invalid enter key
function invalid_enter(e) {
  e = e || window.event;
  const code = e.keyCode || e.which;
  if (code === 13) return false;
}

// ---------- config ----------
const SETLIST_MAP = {
  A: "lists/setA.tsv",
  B: "lists/setB.tsv",
  C: "lists/setC.tsv",
};

// scale is 1..5
const SCALE_MIN = 1;
const SCALE_MAX = 5;

// ---------- globals ----------
let outfile;
let file_list = []; // array of objects: {conv, tgt, id, system, pair, meta}
let nat_scores = [];
let sim_scores = [];
let n = 0;

// radio node lists (set after display)
let nat_radios = [];
let sim_radios = [];

// 「誤って更新/閉じる」を減らすためのガード
let experiment_started = false;

// ---------- load list ----------
async function loadText(filename) {
  const resp = await fetch(filename, { cache: "no-store" });
  if (!resp.ok) throw new Error(`リストの読み込みに失敗しました: ${filename} (${resp.status})`);
  const text = await resp.text();
  return text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

function deriveIdFromUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const base = path.split("/").pop() || url;
    return base.replace(/\.[^/.]+$/, "");
  } catch {
    const base = url.split("/").pop() || url;
    return base.replace(/\.[^/.]+$/, "");
  }
}

// TSV: conv <tab> tgt <tab> sample_id <tab> system <tab> pair <tab> (optional meta...)
function parseLine(line) {
  let parts = line.split("\t");
  if (parts.length < 2) parts = line.split(","); // fallback
  parts = parts.map((p) => p.trim());

  if (parts.length < 2) {
    throw new Error(`TSVの形式が不正です（最低2列必要）: ${line}`);
  }

  const conv = parts[0];
  const tgt = parts[1];
  const id = parts[2] ? parts[2] : deriveIdFromUrl(conv);

  const system = parts[3] ? parts[3] : "";
  const pair = parts[4] ? parts[4] : "";

  const meta = parts.slice(5).join(" ");

  return { conv, tgt, id, system, pair, meta };
}

async function makeFileList(listPath) {
  const lines = await loadText(listPath);
  const samples = lines.map(parseLine);
  shuffleArray(samples);
  return samples;
}

// ---------- UI control ----------
function Display() {
  document.getElementById("Display1").style.display = "none";
  document.getElementById("Display2").style.display = "block";
}

function updateProgress() {
  const total = file_list.length || 1;
  const ratio = (n + 1) / total;
  const bar = document.getElementById("progressBar");
  if (bar) bar.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
}

function setAudio() {
  const cur = file_list[n];
  document.getElementById("page").textContent = `${n + 1}/${file_list.length}`;

  // audio
  document.getElementById("audio_tgt").innerHTML =
    `<b>参照音声</b><br>` +
    `<audio src="${cur.tgt}" controls preload="auto" playsinline controlsList="nodownload"></audio>`;

  document.getElementById("audio_conv").innerHTML =
    `<b>評価音声</b><br>` +
    `<audio src="${cur.conv}" controls preload="auto" playsinline controlsList="nodownload"></audio>`;

  // metaは非表示（system/pair等が見えるとバイアス）
  document.getElementById("meta").textContent = "";

  updateProgress();
}

function clearRadios(radios) {
  for (const r of radios) r.checked = false;
}

function checkRadioByValue(radios, value) {
  for (const r of radios) {
    if (Number(r.value) === Number(value)) {
      r.checked = true;
      return;
    }
  }
}

function evalCheck() {
  const ns = nat_scores[n];
  if (ns >= SCALE_MIN && ns <= SCALE_MAX) checkRadioByValue(nat_radios, ns);
  else clearRadios(nat_radios);

  const ss = sim_scores[n];
  if (ss >= SCALE_MIN && ss <= SCALE_MAX) checkRadioByValue(sim_radios, ss);
  else clearRadios(sim_radios);
}

function allAnsweredForCurrent() {
  const ns = nat_scores[n];
  const ss = sim_scores[n];
  return (ns >= SCALE_MIN && ns <= SCALE_MAX) && (ss >= SCALE_MIN && ss <= SCALE_MAX);
}

function setButton() {
  document.getElementById("prev").disabled = (n === 0);

  const isLast = (n === file_list.length - 1);
  document.getElementById("next2").disabled = isLast || !allAnsweredForCurrent();
  document.getElementById("finish").disabled = !isLast || !allAnsweredForCurrent();
}

function evaluation() {
  for (const r of nat_radios) {
    if (r.checked) nat_scores[n] = Number(r.value);
  }
  for (const r of sim_radios) {
    if (r.checked) sim_scores[n] = Number(r.value);
  }
  setButton();
}

function init() {
  n = 0;
  nat_radios = Array.from(document.getElementsByName("nat"));
  sim_radios = Array.from(document.getElementsByName("sim"));
  setAudio();
  evalCheck();
  setButton();
}

// ---------- export ----------
function exportCSV() {
  // sample_id は表示しないが、解析に必要なのでCSVには残す
  let csvData = "idx,sample_id,system,pair,conv_url,tgt_url,naturalness,similarity,meta\r\n";

  for (let i = 0; i < file_list.length; i++) {
    const s = file_list[i];
    const metaSafe = (s.meta || "").replaceAll('"', '""');

    csvData += `${i + 1},${s.id},${s.system || ""},${s.pair || ""},${s.conv},${s.tgt},${nat_scores[i] || ""},${sim_scores[i] || ""},"${metaSafe}"\r\n`;
  }

  const link = document.createElement("a");
  document.body.appendChild(link);
  link.style = "display:none";
  const blob = new Blob([csvData], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  link.href = url;
  link.download = outfile;
  link.click();
  window.URL.revokeObjectURL(url);
  link.parentNode.removeChild(link);
}

function next() {
  if (n < file_list.length - 1) {
    n++;
    setAudio();
    evalCheck();
    setButton();
  }
}

function prev() {
  if (n > 0) {
    n--;
    setAudio();
    evalCheck();
    setButton();
  }
}

function finish() {
  const ok = confirm("CSVをダウンロードして終了します。よろしいですか？");
  if (!ok) return;
  exportCSV();
  experiment_started = false; // 終了したのでガード解除
}

// ---------- start experiment ----------
async function start_experiment() {
  // 参加者ID（ファイル名に使うので安全化）
  const raw = document.getElementById("name").value;
if (!raw || !raw.trim()) {
  alert("名前を入力してください。");
  return;
}
const name = raw
  .trim()
  .replace(/\s+/g, "_")
  .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");


  let set_key = "";
  const radios = document.getElementsByName("set");
  for (const r of radios) {
    if (r.checked) set_key = r.value;
  }
  if (!set_key || !SETLIST_MAP[set_key]) {
    alert("セットリスト（A/B/C）を選択してください。");
    return;
  }

  // loading表示（ここはDisplay切替より前に見える必要がある）
  const loading = document.getElementById("loading");
  const startBtn = document.getElementById("next1");
  loading.style.display = "inline-block";
  startBtn.disabled = true;

  try {
    // まずリストを読み込む（読み込み中はDisplay1のまま）
    file_list = await makeFileList(SETLIST_MAP[set_key]);

    nat_scores = new Array(file_list.length).fill(0);
    sim_scores = new Array(file_list.length).fill(0);

    const ts = new Date().toISOString().replaceAll(":", "").replaceAll("-", "").slice(0, 15);
    outfile = `${name}_set${set_key}_${ts}.csv`;

    // 準備できたら評価画面へ
    Display();
    init();

    // 誤更新ガードON
    experiment_started = true;
  } catch (e) {
    alert(String(e));
    console.error(e);
  } finally {
    loading.style.display = "none";
    startBtn.disabled = false;
  }
}

// bind
document.onkeypress = invalid_enter;

// 誤って閉じる/更新するのを減らす（参加者が迷子になりがちなポイント）
window.addEventListener("beforeunload", (e) => {
  if (!experiment_started) return;
  e.preventDefault();
  e.returnValue = "";
});
