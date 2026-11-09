# ARCHINODE — 본문 사진을 자기 도메인으로 옮기기 (A-371, 2026-11-09)
#
# 왜: 본문 사진 989곳이 images.unsplash.com 을 핫링크하고 있었다.
#     남의 서버가 멈추면 사이트 사진이 통째로 빈다. Unsplash 라이선스는
#     내려받아 자기 서버에 두는 것을 명시적으로 허용한다(핫링크 의무는
#     API 사용자에게만 적용되고 이 사이트는 API 를 쓰지 않는다).
#
# 쓰는 법: 리포 뿌리에서 PowerShell 로 한 번만.
#     .\tools\fetch-photos.ps1
#
# 사진 112장을 assets/photos/ 에 1800px 로 받는다. 작은 크기(600·240)는
# 노드가 이 원본에서 만들어 넣는다 — 그래서 받을 양이 반으로 줄었다.
# 이미 있는 파일은 건너뛴다. 중간에 끊겨도 다시 돌리면 이어진다.

$ErrorActionPreference = "Stop"
$dir = Join-Path $PSScriptRoot "..\assets\photos"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$ids = @(
  # ── A-379(2026-11-09) 카테고리 카드용 20장 추가 ──
  'photo-1577412647305-991150c7d163'
  'photo-1543751416-705d3e34d02a'
  'photo-1515263487990-61b07816b324'
  'photo-1627257058769-0a99529e4312'
  'photo-1606170033648-5d55a3edf314'
  'photo-1606241018160-4985a8ab5dec'
  'photo-1762117360871-f11fbad00ee1'
  'photo-1565814329452-e1efa11c5b89'
  'photo-1759722667550-81316a23d723'
  'photo-1620517762957-3e4622447d9c'
  'photo-1788448093731-6f7db7164ef3'
  'photo-1590251024078-8a6d9f90b02d'
  'photo-1523350165414-082d792c4bcc'
  'photo-1643949700215-e61cdca053f7'
  'photo-1553095066-5014bc7b7f2d'
  'photo-1612764550058-b7ccce95a20e'
  'photo-1576698483491-8c43f0862543'
  'photo-1613849925362-38fb4c16ff36'
  'photo-1538903723116-763313165283'
  'photo-1761053130711-2515ef532bb5'
  # ── 기존 95장 ──
  'photo-1448630360428-65456885c650'
  'photo-1452860606245-08befc0ff44b'
  'photo-1466611653911-95081537e5b7'
  'photo-1466692476868-aef1dfb1e735'
  'photo-1480714378408-67cf0d13bc1b'
  'photo-1485827404703-89b55fcc595e'
  'photo-1486325212027-8081e485255e'
  'photo-1486718448742-163732cd1544'
  'photo-1487958449943-2429e8be8625'
  'photo-1493663284031-b7e3aefcae8e'
  'photo-1497366216548-37526070297c'
  'photo-1497366754035-f200968a6e72'
  'photo-1497436072909-60f360e1d4b1'
  'photo-1500382017468-9049fed747ef'
  'photo-1502005229762-cf1b2da7c5d6'
  'photo-1503594384566-461fe158e797'
  'photo-1503602642458-232111445657'
  'photo-1504307651254-35680f356dfd'
  'photo-1505691938895-1758d7feb511'
  'photo-1505693416388-ac5ce068fe85'
  'photo-1505764706515-aa95265c5abc'
  'photo-1506521781263-d8422e82f27a'
  'photo-1506816561089-5cc37b3aa9b0'
  'photo-1507473885765-e6ed057f782c'
  'photo-1513506003901-1e6a229e2d15'
  'photo-1517059224940-d4af9eec41b7'
  'photo-1517154421773-0529f29ea451'
  'photo-1517336714731-489689fd1ca8'
  'photo-1518173946687-a4c8892bbd9f'
  'photo-1518709268805-4e9042af9f23'
  'photo-1518770660439-4636190af475'
  'photo-1518780664697-55e3ad937233'
  'photo-1524484485831-a92ffc0de03f'
  'photo-1524758631624-e2822e304c36'
  'photo-1532372320572-cda25653a26d'
  'photo-1532996122724-e3c354a0b15b'
  'photo-1534430480872-3498386e7856'
  'photo-1538485399081-7191377e8241'
  'photo-1539037116277-4db20889f2d4'
  'photo-1540932239986-30128078f3c5'
  'photo-1541888946425-d81bb19240f5'
  'photo-1543783207-ec64e4d95325'
  'photo-1545179605-1296651e9d43'
  'photo-1545324418-cc1a3fa10c00'
  'photo-1551634979-2b11f8c946fe'
  'photo-1552321554-5fefe8c9ef14'
  'photo-1555041469-a586c61ea9bc'
  'photo-1556228720-195a672e8a03'
  'photo-1556909114-f6e7ad7d3136'
  'photo-1556910103-1c02745aae4d'
  'photo-1558002038-1055907df827'
  'photo-1558171813-4c088753af8f'
  'photo-1558494949-ef010cbdcc31'
  'photo-1558618666-fcd25c85cd64'
  'photo-1562259949-e8e7689d7828'
  'photo-1564540583246-934409427776'
  'photo-1565008447742-97f6f38c985c'
  'photo-1565538810643-b5bdb714032a'
  'photo-1567538096630-e0c55bd6374c'
  'photo-1568605114967-8130f3a36994'
  'photo-1571902943202-507ec2618e8f'
  'photo-1573164574001-518958d9baa2'
  'photo-1574691250077-03a929faece5'
  'photo-1580480055273-228ff5388ef8'
  'photo-1581092160562-40aa08e78837'
  'photo-1581094288338-2314dddb7ece'
  'photo-1581094794329-c8112a89af12'
  'photo-1581539250439-c96689b516dd'
  'photo-1582719188393-bb71ca45dbb9'
  'photo-1584622650111-993a426fbf0a'
  'photo-1586023492125-27b2c045efd7'
  'photo-1586105251261-72a756497a11'
  'photo-1589939705384-5185137a7f0f'
  'photo-1591405351990-4726e331f141'
  'photo-1591429939960-b7d5add10b5c'
  'photo-1593062096033-9a26b09da705'
  'photo-1600166898405-da9535204843'
  'photo-1600210491892-03d54c0aaf87'
  'photo-1600566752355-35792bedcfea'
  'photo-1600566753086-00f18fb6b3ea'
  'photo-1600585154340-be6161a56a0c'
  'photo-1600607687939-ce8a6c25118c'
  'photo-1600891964599-f61ba0e24092'
  'photo-1602810318383-e386cc2a3ccf'
  'photo-1604014237800-1c9102c219da'
  'photo-1605276373954-0c4a0dac5b12'
  'photo-1605276374104-dee2a0ed3cd6'
  'photo-1611273426858-450d8e3c9fce'
  'photo-1616046229478-9901c5536a45'
  'photo-1616594039964-ae9021a400a0'
  'photo-1618221195710-dd6b41faaea6'
  'photo-1620626011761-996317b8d101'
)

$ok = 0; $skip = 0; $fail = @()
for ($i = 0; $i -lt $ids.Count; $i++) {
  $id = $ids[$i]
  $out = Join-Path $dir ("$id-1800.jpg")
  if (Test-Path $out) { $skip++; continue }
  $url = "https://images.unsplash.com/$id" + "?w=1800&q=80&fm=jpg"
  Write-Host ("[{0}/{1}] {2}" -f ($i+1), $ids.Count, $id)
  try {
    Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -TimeoutSec 60
    $len = (Get-Item $out).Length
    if ($len -lt 10000) { Remove-Item $out -Force; throw "너무 작다($len bytes) — 사진이 아닐 수 있다" }
    $ok++
  } catch {
    $fail += ("{0} — {1}" -f $id, $_.Exception.Message)
  }
  Start-Sleep -Milliseconds 300
}

Write-Host ""
Write-Host ("받음 {0} / 건너뜀 {1} / 실패 {2}" -f $ok, $skip, $fail.Count)
if ($fail.Count -gt 0) {
  Write-Host "── 실패 목록 (다시 돌리면 이것만 재시도한다) ──"
  $fail | ForEach-Object { Write-Host ("  " + $_) }
  exit 1
}
$total = (Get-ChildItem $dir -Filter *-1800.jpg | Measure-Object -Property Length -Sum).Sum
Write-Host ("assets/photos 합계 {0:N1} MB — 노드에게 알려 주세요" -f ($total / 1MB))
