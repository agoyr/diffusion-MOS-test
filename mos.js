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
let file_list = []; // array of objects: {conv, tgt, id, meta}
let nat_scores = [];
let sim_scores = [];
let n = 0;

// radio node lists (set after display)
let nat_radios = [];
let sim_radios = [];

// ---------- load list ----------
async function loadText(filename) {
  const resp = await fetch(filename, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Failed to load list: ${filename} (${resp.status})`);
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
    return base.replace(/\.[^/.]+$/, ""); // remove extension
  } catch {
    const base = url.split("/").pop() || url;
    return base.replace(/\.[^/.]+$/, "");
  }
}

function parseLine(line) {
  // TSV優先。ダメならCSVとして読む（保険）
  let parts = line.split("\t");
  if (parts.length < 2) parts = line.split(",");
  parts = parts.map((p) => p.trim());

  if (parts.length < 2) {
    throw new Error(`Invalid line (need at least 2 columns): ${line}`);
  }

  const conv = parts[0];
  const tgt  = parts[1];
  const id   = parts[2] ? parts[2] : deriveIdFromUrl(conv);

  // B方式：system/pairを独立列として保持
  const system = parts[3] ? parts[3] : "";
  const pair   = parts[4] ? parts[4] : "";

  // 6列目以降があれば自由メモとして残す（任意）
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

function setAudio() {
  const cur = file_list[n];
  document.getElementById("page").textContent = `${n + 1}/${file_list.length}`;
  document.getElementById("sample_id").textContent = `Sample: ${cur.id}`;

  document.getElementById("audio_tgt").innerHTML =
    `<b>Target speaker (reference)</b><br>` +
    `<audio src="${cur.tgt}" controls preload="auto"></audio>`;

  document.getElementById("audio_conv").innerHTML =
    `<b>Converted speech (to be rated)</b><br>` +
    `<audio src="${cur.conv}" controls preload="auto"></audio>`;

  // optional: show meta
  document.getElementById("meta").textContent = cur.meta ? `Meta: ${cur.meta}` : "";
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
  // naturalness
  const ns = nat_scores[n];
  if (ns >= SCALE_MIN && ns <= SCALE_MAX) checkRadioByValue(nat_radios, ns);
  else clearRadios(nat_radios);

  // similarity
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
  // save selected values
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
  // columns: idx, sample_id, system, pair, conv_url, tgt_url, naturalness, similarity, meta
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
  exportCSV();
}

// ---------- start experiment ----------
async function start_experiment() {
  const name = document.getElementById("name").value.trim().replaceAll(" ", "_");
  if (!name) {
    alert("Please enter your name.");
    return;
  }

  // choose set A/B
  let set_key = "";
  const radios = document.getElementsByName("set");
  for (const r of radios) {
    if (r.checked) set_key = r.value;
  }
  if (!set_key || !SETLIST_MAP[set_key]) {
    alert("Please choose setlist A or B.");
    return;
  }

  // show loading
  document.getElementById("loading").style.display = "block";

  try {
    Display();

    // load and shuffle list
    file_list = await makeFileList(SETLIST_MAP[set_key]);

    // init score arrays
    nat_scores = new Array(file_list.length).fill(0);
    sim_scores = new Array(file_list.length).fill(0);

    // output file name
    const ts = new Date().toISOString().replaceAll(":", "").replaceAll("-", "").slice(0, 15);
    outfile = `${name}_set${set_key}_${ts}.csv`;

    // hide loading and start
    document.getElementById("loading").style.display = "none";
    init();
  } catch (e) {
    document.getElementById("loading").style.display = "none";
    alert(String(e));
    console.error(e);
  }
}

// bind
document.onkeypress = invalid_enter;
