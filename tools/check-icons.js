// The logo each built app shows on Windows: the icon Windows itself takes
// from the .exe (as the desktop, Explorer and the taskbar show it), set
// beside the .ico the app was built with. Each app's must be close to its
// own .ico and unlike the others' (compared at 16 px, by color).
//   node tools/check-icons.js "<name>|<the .exe>|<its .ico>" … [--out <folder>]
// An item with no .exe ("Noor||build/icon.ico") is only compared with.
// Windows only. Saves the icons taken from the .exe files (32 px PNG);
// prints the differences (0: the same, 255: as far apart as can be);
// exits 1 if an app shows another's logo or not its own.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = path.resolve(outAt >= 0 ? args[outAt + 1] : fs.mkdtempSync(path.join(os.tmpdir(), "noor-icons-")));
fs.mkdirSync(out, { recursive: true });
const items = args.filter((arg, i) => arg.includes("|") && args[i - 1] !== "--out").map((arg) => {
  const [name, exe, ico] = arg.split("|");
  return { name, exe: exe ? path.resolve(exe) : "", ico: path.resolve(ico) };
});
if (process.platform !== "win32") {
  console.log(JSON.stringify({ why: "Windows only" }));
  process.exit(2);
}

const PS = String.raw`
Add-Type -AssemblyName System.Drawing
function Small($bmp) { $s = New-Object System.Drawing.Bitmap 16, 16; $g = [System.Drawing.Graphics]::FromImage($s); $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($bmp, 0, 0, 16, 16); $g.Dispose(); return $s }
function Diff($a, $b) { $t = 0; for ($y = 0; $y -lt 16; $y++) { for ($x = 0; $x -lt 16; $x++) { $p = $a.GetPixel($x, $y); $q = $b.GetPixel($x, $y); $t += [math]::Abs($p.R - $q.R) + [math]::Abs($p.G - $q.G) + [math]::Abs($p.B - $q.B) } }; return [math]::Round($t / (16 * 16 * 3), 1) }
$items = ConvertFrom-Json $env:NOOR_ICON_ITEMS
$seen = @()
foreach ($i in $items) {
  $ico = (New-Object System.Drawing.Icon($i.ico, 256, 256)).ToBitmap()
  $shown = $null
  if ($i.exe) {
    $shown = [System.Drawing.Icon]::ExtractAssociatedIcon($i.exe).ToBitmap()
    $shown.Save((Join-Path $env:NOOR_ICON_OUT ($i.name.Replace(' ', '-') + '-exe.png')), [System.Drawing.Imaging.ImageFormat]::Png)
  }
  $seen += [pscustomobject]@{ name = $i.name; exe = $i.exe; shown = $(if ($shown) { Small $shown } else { $null }); ico = (Small $ico); size = $(if ($shown) { "$($shown.Width)x$($shown.Height)" } else { '' }) }
}
$result = @()
foreach ($s in $seen) {
  if (-not $s.shown) { continue }
  $result += [pscustomobject]@{ name = $s.name; size = $s.size; toOwnLogo = (Diff $s.shown $s.ico); toOtherLogos = @($seen | Where-Object { $_.name -ne $s.name } | ForEach-Object { [pscustomobject]@{ name = $_.name; diff = (Diff $s.shown $_.ico) } }) }
}
ConvertTo-Json @($result) -Depth 5
`;
const ran = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", PS], { env: { ...process.env, NOOR_ICON_ITEMS: JSON.stringify(items), NOOR_ICON_OUT: out }, encoding: "utf8", timeout: 120000 });
let results;
try {
  results = JSON.parse(ran.stdout);
} catch (error) {
  console.log(JSON.stringify({ why: "PowerShell gave no answer", said: (ran.stdout + ran.stderr).slice(0, 1500) }, null, 2));
  process.exit(2);
}
const problems = [];
for (const r of results) {
  // (The same logo, made smaller by Windows or by the check, stays within
  // a few steps; two of the apps' logos, with their own colors, far apart.)
  if (r.toOwnLogo > 12) problems.push(`${r.name}: Windows shows a logo unlike its own (difference ${r.toOwnLogo})`);
  for (const other of r.toOtherLogos) if (other.diff < 25) problems.push(`${r.name}: its logo looks like ${other.name}'s (difference ${other.diff})`);
}
console.log(JSON.stringify({ out, results, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
