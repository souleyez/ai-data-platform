$ErrorActionPreference = 'Stop'

$outputPath = 'C:\Users\soulzyn\Desktop\AI Data Platform项目方案_Divoom_客户版_V2_含ERP样板_2026-03-30.pptx'

$ppLayoutTitle = 1
$ppLayoutText = 2
$ppLayoutBlank = 12
$ppSlideSizeOnScreen16x9 = 15
$ppSaveAsOpenXMLPresentation = 24
$msoFalse = 0
$msoTrue = -1
$msoTextOrientationHorizontal = 1

function Set-SlideBackground {
  param(
    $Slide,
    [string]$Color
  )
  $Slide.FollowMasterBackground = $msoFalse
  $Slide.Background.Fill.Visible = $msoTrue
  $Slide.Background.Fill.Solid()
  $Slide.Background.Fill.ForeColor.RGB = [int]("0x$Color")
}

function Add-TopBar {
  param(
    $Slide,
    [string]$Color = '41230B'
  )
  $shape = $Slide.Shapes.AddShape(1, 0, 0, 960, 12)
  $shape.Fill.Solid()
  $shape.Fill.ForeColor.RGB = [int]("0x$Color")
  $shape.Line.Visible = $msoFalse
}

function Add-Footer {
  param(
    $Slide,
    [int]$PageNo,
    [bool]$Dark = $false
  )
  $color = if ($Dark) { 'D0C2A4' } else { '7A6B5A' }
  $left = $Slide.Shapes.AddTextbox($msoTextOrientationHorizontal, 24, 510, 300, 18)
  $left.TextFrame.TextRange.Text = 'AI Data Platform · Divoom 客户方案'
  $left.TextFrame.TextRange.Font.NameFarEast = 'Microsoft YaHei'
  $left.TextFrame.TextRange.Font.Size = 9
  $left.TextFrame.TextRange.Font.Color.RGB = [int]("0x$color")
  $left.Line.Visible = $msoFalse

  $right = $Slide.Shapes.AddTextbox($msoTextOrientationHorizontal, 910, 510, 24, 18)
  $right.TextFrame.TextRange.Text = [string]$PageNo
  $right.TextFrame.TextRange.Font.NameFarEast = 'Microsoft YaHei'
  $right.TextFrame.TextRange.Font.Size = 10
  $right.TextFrame.TextRange.Font.Color.RGB = [int]("0x$color")
  $right.Line.Visible = $msoFalse
}

function Add-Textbox {
  param(
    $Slide,
    [single]$Left,
    [single]$Top,
    [single]$Width,
    [single]$Height,
    [string]$Text,
    [int]$FontSize = 18,
    [string]$Color = '203040',
    [bool]$Bold = $false
  )
  $tb = $Slide.Shapes.AddTextbox($msoTextOrientationHorizontal, $Left, $Top, $Width, $Height)
  $tb.TextFrame.TextRange.Text = $Text
  $tb.TextFrame.TextRange.Font.NameFarEast = 'Microsoft YaHei'
  $tb.TextFrame.TextRange.Font.Name = 'Microsoft YaHei'
  $tb.TextFrame.TextRange.Font.Size = $FontSize
  $tb.TextFrame.TextRange.Font.Bold = if ($Bold) { $msoTrue } else { $msoFalse }
  $tb.TextFrame.TextRange.Font.Color.RGB = [int]("0x$Color")
  $tb.Line.Visible = $msoFalse
  return $tb
}

function Add-Panel {
  param(
    $Slide,
    [single]$Left,
    [single]$Top,
    [single]$Width,
    [single]$Height,
    [string]$FillColor,
    [string]$LineColor = 'D7E0EA'
  )
  $shape = $Slide.Shapes.AddShape(5, $Left, $Top, $Width, $Height)
  $shape.Fill.Solid()
  $shape.Fill.ForeColor.RGB = [int]("0x$FillColor")
  $shape.Line.ForeColor.RGB = [int]("0x$LineColor")
  $shape.Line.Weight = 1
  return $shape
}

function Add-BulletBox {
  param(
    $Slide,
    [single]$Left,
    [single]$Top,
    [single]$Width,
    [single]$Height,
    [string[]]$Items,
    [int]$FontSize = 16,
    [string]$Color = '203040'
  )
  $tb = $Slide.Shapes.AddTextbox($msoTextOrientationHorizontal, $Left, $Top, $Width, $Height)
  $tb.Line.Visible = $msoFalse
  $tb.TextFrame.WordWrap = $msoTrue
  $tb.TextFrame.AutoSize = 0
  $textRange = $tb.TextFrame.TextRange
  $textRange.Text = ($Items -join "`r")
  $textRange.Font.NameFarEast = 'Microsoft YaHei'
  $textRange.Font.Name = 'Microsoft YaHei'
  $textRange.Font.Size = $FontSize
  $textRange.Font.Color.RGB = [int]("0x$Color")

  for ($i = 1; $i -le $textRange.Paragraphs().Count; $i++) {
    $paragraph = $textRange.Paragraphs($i)
    $paragraph.ParagraphFormat.Bullet.Visible = $msoTrue
    $paragraph.ParagraphFormat.Bullet.Character = 8226
  }
  return $tb
}

$app = $null
$presentation = $null

try {
  $app = New-Object -ComObject PowerPoint.Application
  $app.Visible = $msoTrue
  $presentation = $app.Presentations.Add($msoTrue)
  $presentation.PageSetup.SlideSize = $ppSlideSizeOnScreen16x9

  # Slide 1
  $slide = $presentation.Slides.Add(1, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color '0B2341'
  Add-TopBar -Slide $slide -Color '6BB3D9'
  $rightPanel = $slide.Shapes.AddShape(1, 660, 12, 300, 528)
  $rightPanel.Fill.Solid()
  $rightPanel.Fill.ForeColor.RGB = [int]'0x143A66'
  $rightPanel.Line.Visible = $msoFalse
  Add-Textbox -Slide $slide -Left 64 -Top 60 -Width 220 -Height 24 -Text 'AI Data Platform' -FontSize 20 -Color 'F3DEC0' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 64 -Top 108 -Width 340 -Height 36 -Text '项目方案' -FontSize 30 -Color 'FFFFFF' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 64 -Top 168 -Width 500 -Height 24 -Text '面向客户：Divoom / 深圳市战音科技有限公司' -FontSize 20 -Color 'DBE7F4' | Out-Null
  Add-Textbox -Slide $slide -Left 64 -Top 220 -Width 530 -Height 52 -Text '构建产品知识、内容资产、渠道支撑与经营分析的一体化 AI 数据工作台' -FontSize 18 -Color 'F3DEC0' -Bold $true | Out-Null
  Add-Panel -Slide $slide -Left 64 -Top 304 -Width 540 -Height 110 -FillColor '123154' -LineColor '295487' | Out-Null
  Add-BulletBox -Slide $slide -Left 82 -Top 326 -Width 500 -Height 82 -Items @(
    '统一接入官网、产品资料、FAQ、Warranty、证书、渠道文档与业务数据',
    '支持知识问答、模板输出、经营分析和客户提案生成',
    '分阶段建设，优先形成销售、市场、客服可直接使用的能力'
  ) -FontSize 15 -Color 'FFFFFF' | Out-Null
  Add-Textbox -Slide $slide -Left 64 -Top 468 -Width 120 -Height 20 -Text '2026.03' -FontSize 16 -Color 'F3DEC0' | Out-Null
  Add-Footer -Slide $slide -PageNo 1 -Dark $true

  # Slide 2
  $slide = $presentation.Slides.Add(2, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 350 -Height 24 -Text '01 客户业务理解' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 36 -Top 60 -Width 420 -Height 18 -Text '基于官网公开信息与项目沟通方向提炼' -FontSize 10 -Color '64748B' | Out-Null
  Add-Panel -Slide $slide -Left 36 -Top 98 -Width 430 -Height 360 -FillColor 'EEF4FB' | Out-Null
  Add-Panel -Slide $slide -Left 490 -Top 98 -Width 430 -Height 360 -FillColor 'F7F9FC' | Out-Null
  Add-Textbox -Slide $slide -Left 54 -Top 122 -Width 220 -Height 20 -Text '我们对 Divoom 的理解' -FontSize 18 -Color '0B2341' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 54 -Top 158 -Width 382 -Height 270 -Items @(
    '国际化消费电子品牌，兼具硬件、App、社区与内容生态',
    '产品覆盖 Pixel Speaker、Lighting、Backpack、Classic Speaker 等多品类',
    '官网具备 FAQ、Warranty、Certificate、Media、Gallery、Store 等完整内容体系',
    '项目价值不仅在资料管理，还在渠道、客服、内容与经营数据协同'
  ) -FontSize 15 -Color '203040' | Out-Null
  Add-Textbox -Slide $slide -Left 508 -Top 122 -Width 220 -Height 20 -Text '由此带来的管理挑战' -FontSize 18 -Color '0B2341' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 508 -Top 158 -Width 382 -Height 270 -Items @(
    '产品资料、FAQ、证书、市场素材、渠道文档分散，复用效率低',
    '销售、市场、客服、海外渠道对同一产品输出口径不一致',
    '新品发布、展会、招商、售后答疑等内容生产成本高',
    '即使未来接入 ERP、订单、库存、客诉数据，也容易继续与产品知识割裂'
  ) -FontSize 15 -Color '203040' | Out-Null
  Add-Textbox -Slide $slide -Left 54 -Top 474 -Width 820 -Height 24 -Text '核心判断：该项目应建设为统一 AI 数据工作台，而不是单一聊天助手。' -FontSize 17 -Color '2156D9' -Bold $true | Out-Null
  Add-Footer -Slide $slide -PageNo 2

  # Slide 3
  $slide = $presentation.Slides.Add(3, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 350 -Height 24 -Text '02 项目目标与价值' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 36 -Top 60 -Width 460 -Height 18 -Text '先做知识底座，再逐步接入经营数据与模板输出' -FontSize 10 -Color '64748B' | Out-Null
  $cards = @(
    @{x=36;y=110;t='统一入库';b='官网、产品资料、FAQ、Warranty、证书、渠道资料统一沉淀'},
    @{x=332;y=110;t='结构化理解';b='quick parse / deep parse 识别产品、合同、技术文档等结构'},
    @{x=628;y=110;t='知识问答';b='基于知识库做可追溯问答，减少口径偏差'},
    @{x=36;y=270;t='模板输出';b='自动输出产品介绍、FAQ、培训材料、渠道方案、经营报告'},
    @{x=332;y=270;t='多角色使用';b='销售、市场、客服、管理层都可直接使用'},
    @{x=628;y=270;t='知识+数据';b='一期即可纳入 ERP 只读样板，逐步形成知识 + 数据双轮能力'}
  )
  foreach ($c in $cards) {
    Add-Panel -Slide $slide -Left $c.x -Top $c.y -Width 260 -Height 120 -FillColor 'F7F9FC' | Out-Null
    Add-Textbox -Slide $slide -Left ($c.x + 16) -Top ($c.y + 16) -Width 160 -Height 20 -Text $c.t -FontSize 18 -Color '0B2341' -Bold $true | Out-Null
    Add-Textbox -Slide $slide -Left ($c.x + 16) -Top ($c.y + 50) -Width 220 -Height 48 -Text $c.b -FontSize 13 -Color '203040' | Out-Null
  }
  Add-Footer -Slide $slide -PageNo 3

  # Slide 4
  $slide = $presentation.Slides.Add(4, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 420 -Height 24 -Text '03 平台定位与现有能力' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 36 -Top 60 -Width 520 -Height 18 -Text '基于 ai-data-platform 现有基础，快速收敛为客户版方案' -FontSize 10 -Color '64748B' | Out-Null
  Add-Panel -Slide $slide -Left 36 -Top 102 -Width 280 -Height 350 -FillColor '0B2341' -LineColor '0B2341' | Out-Null
  Add-Textbox -Slide $slide -Left 56 -Top 128 -Width 120 -Height 20 -Text '平台定位' -FontSize 20 -Color 'F3DEC0' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 56 -Top 166 -Width 230 -Height 250 -Items @(
    '不是替代官网、ERP 或 App',
    '而是位于其上的数据接入层、知识理解层、检索供料层与模板输出层',
    '把内容资产和经营数据沉淀为可复用、可追溯、可输出的企业能力'
  ) -FontSize 15 -Color 'FFFFFF' | Out-Null
  Add-Panel -Slide $slide -Left 338 -Top 102 -Width 582 -Height 350 -FillColor 'F7F9FC' | Out-Null
  Add-Textbox -Slide $slide -Left 360 -Top 128 -Width 260 -Height 20 -Text '平台当前已具备的基础能力' -FontSize 20 -Color '0B2341' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 360 -Top 166 -Width 530 -Height 250 -Items @(
    '文档接入与上传，支持 quick parse / deep parse 双层解析',
    '文档分类、structured profile、知识库组织与混合检索',
    '首页 AI 工作台、文档中心、数据源工作台、报表模板与输出中心',
    '支持只读优先的数据接入策略，可承接一期 ERP / 业务系统样板接入',
    '已具备 Web、API、Worker 三层结构，适合继续做客户化落地'
  ) -FontSize 15 -Color '203040' | Out-Null
  Add-Footer -Slide $slide -PageNo 4

  # Slide 5
  $slide = $presentation.Slides.Add(5, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 300 -Height 24 -Text '04 解决方案架构' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 36 -Top 60 -Width 420 -Height 18 -Text '统一接入、双层解析、混合检索、模板输出' -FontSize 10 -Color '64748B' | Out-Null
  $arch = @(
    @{x=36;t='数据接入层';b='官网页面`r产品文档`rFAQ / Warranty`r证书 / 媒体`rERP / 订单 / 库存 / 客诉'},
    @{x=216;t='解析理解层';b='文本抽取`rOCR fallback`rquick parse`rdeep parse`rstructured profile'},
    @{x=396;t='知识检索层';b='知识库组织`r候选过滤`r混合检索`r证据召回`r结果 rerank'},
    @{x=576;t='模板输出层';b='产品介绍`rFAQ`r渠道方案`r经营分析`rPPT / 页面 / 表格'},
    @{x=756;t='工作台层';b='AI 工作台`r文档中心`r数据源台`r报表中心`r审计与权限'}
  )
  foreach ($a in $arch) {
    Add-Panel -Slide $slide -Left $a.x -Top 155 -Width 150 -Height 170 -FillColor 'EEF4FB' | Out-Null
    Add-Textbox -Slide $slide -Left ($a.x + 8) -Top 172 -Width 134 -Height 18 -Text $a.t -FontSize 17 -Color '0B2341' -Bold $true | Out-Null
    Add-Textbox -Slide $slide -Left ($a.x + 10) -Top 204 -Width 130 -Height 110 -Text $a.b -FontSize 12 -Color '203040' | Out-Null
  }
  Add-Textbox -Slide $slide -Left 190 -Top 226 -Width 18 -Height 18 -Text '→' -FontSize 28 -Color '2156D9' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 370 -Top 226 -Width 18 -Height 18 -Text '→' -FontSize 28 -Color '2156D9' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 550 -Top 226 -Width 18 -Height 18 -Text '→' -FontSize 28 -Color '2156D9' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 730 -Top 226 -Width 18 -Height 18 -Text '→' -FontSize 28 -Color '2156D9' -Bold $true | Out-Null
  Add-Panel -Slide $slide -Left 90 -Top 370 -Width 760 -Height 58 -FillColor 'FFF8EC' -LineColor 'E4C98D' | Out-Null
  Add-Textbox -Slide $slide -Left 112 -Top 390 -Width 720 -Height 20 -Text '面向客户的核心价值不是单次回答，而是把产品知识、内容资产、渠道物料、客服支撑和经营分析沉淀为统一平台能力。' -FontSize 16 -Color '7A5418' -Bold $true | Out-Null
  Add-Footer -Slide $slide -PageNo 5

  # Slide 6
  $slide = $presentation.Slides.Add(6, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 300 -Height 24 -Text '05 一期建设范围' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 36 -Top 60 -Width 620 -Height 18 -Text '优先做“产品知识与内容中台”，并同步纳入 1 个 ERP / 业务系统只读样板' -FontSize 10 -Color '64748B' | Out-Null
  Add-Panel -Slide $slide -Left 36 -Top 102 -Width 290 -Height 350 -FillColor 'EEF4FB' | Out-Null
  Add-Textbox -Slide $slide -Left 56 -Top 128 -Width 190 -Height 20 -Text '一期接入范围' -FontSize 18 -Color '0B2341' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 56 -Top 166 -Width 240 -Height 250 -Items @(
    '官网产品页与公开内容',
    '产品说明书、规格表、卖点资料',
    'FAQ、Warranty、Certificate',
    '市场海报、展会资料、媒体稿件',
    '渠道销售资料与内部知识文档',
    '1 个 ERP / 业务系统只读样板'
  ) -FontSize 15 -Color '203040' | Out-Null
  Add-Panel -Slide $slide -Left 350 -Top 102 -Width 570 -Height 350 -FillColor 'F7F9FC' | Out-Null
  Add-Textbox -Slide $slide -Left 372 -Top 128 -Width 180 -Height 20 -Text '一期重点应用场景' -FontSize 18 -Color '0B2341' -Bold $true | Out-Null
  $scenes = @(
    @{x=372;y=166;t='产品知识助手';b='快速回答 SKU 卖点、差异、功能说明、证书与保修信息'},
    @{x=646;y=166;t='渠道资料整理';b='自动输出渠道版产品介绍、方案页、规格对比表、FAQ 手册'},
    @{x=372;y=286;t='客服知识支撑';b='沉淀标准答复、售后排查建议、版本差异说明'},
    @{x=646;y=286;t='ERP 样板接入';b='一期接入 1 个 ERP / 业务系统，只读支持订单、库存或销售样板查询'}
  )
  foreach ($scene in $scenes) {
    Add-Panel -Slide $slide -Left $scene.x -Top $scene.y -Width 236 -Height 94 -FillColor 'FFFFFF' | Out-Null
    Add-Textbox -Slide $slide -Left ($scene.x + 12) -Top ($scene.y + 12) -Width 120 -Height 18 -Text $scene.t -FontSize 16 -Color '2156D9' -Bold $true | Out-Null
    Add-Textbox -Slide $slide -Left ($scene.x + 12) -Top ($scene.y + 38) -Width 205 -Height 40 -Text $scene.b -FontSize 12 -Color '203040' | Out-Null
  }
  Add-Footer -Slide $slide -PageNo 6

  # Slide 7
  $slide = $presentation.Slides.Add(7, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 360 -Height 24 -Text '06 实施路径与阶段目标' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 36 -Top 60 -Width 560 -Height 18 -Text '先做实一期知识中台 + ERP 样板，再扩展到更多经营数据与长期运营' -FontSize 10 -Color '64748B' | Out-Null
  $phases = @(
    @{x=70;t='Phase 1';s='4~6 周';fill='EAF2FF';items=@('建立 Divoom 产品知识库','接入官网与核心文档','完成 quick / deep parse 主线','建立产品问答与 FAQ / Warranty 模板','接入 1 个 ERP / 业务系统只读样板')},
    @{x=340;t='Phase 2';s='4~8 周';fill='F5F9FF';items=@('接入更多网页与后台数据源','扩展更多 ERP / 电商 / 客诉系统','增加只读经营分析能力','增加报表模板与导出能力')},
    @{x=610;t='Phase 3';s='持续迭代';fill='FFF9EF';items=@('建立权限与审计体系','支持多角色模板与自动报告','支持多区域 / 多渠道扩展','形成长期运营平台')}
  )
  foreach ($p in $phases) {
    Add-Panel -Slide $slide -Left $p.x -Top 136 -Width 240 -Height 280 -FillColor $p.fill | Out-Null
    Add-Textbox -Slide $slide -Left ($p.x + 16) -Top 156 -Width 80 -Height 20 -Text $p.t -FontSize 20 -Color '0B2341' -Bold $true | Out-Null
    Add-Textbox -Slide $slide -Left ($p.x + 150) -Top 160 -Width 60 -Height 16 -Text $p.s -FontSize 11 -Color '64748B' | Out-Null
    Add-BulletBox -Slide $slide -Left ($p.x + 16) -Top 198 -Width 205 -Height 190 -Items $p.items -FontSize 14 -Color '203040' | Out-Null
  }
  Add-Textbox -Slide $slide -Left 320 -Top 248 -Width 20 -Height 20 -Text '→' -FontSize 28 -Color '2156D9' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 590 -Top 248 -Width 20 -Height 20 -Text '→' -FontSize 28 -Color '2156D9' -Bold $true | Out-Null
  Add-Panel -Slide $slide -Left 86 -Top 442 -Width 720 -Height 52 -FillColor '123154' -LineColor '295487' | Out-Null
  Add-Textbox -Slide $slide -Left 104 -Top 460 -Width 676 -Height 18 -Text '建议先用一期服务销售、市场、客服三类角色，并同步跑通 ERP 样板接入，再逐步扩展更多经营数据。' -FontSize 15 -Color 'FFFFFF' -Bold $true | Out-Null
  Add-Footer -Slide $slide -PageNo 7

  # Slide 8
  $slide = $presentation.Slides.Add(8, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color '0B2341'
  Add-TopBar -Slide $slide -Color '6BB3D9'
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 320 -Height 24 -Text '07 交付建议与下一步' -FontSize 24 -Color 'FFFFFF' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 36 -Top 60 -Width 460 -Height 18 -Text '先形成可演示、可试用、可扩展的客户版平台' -FontSize 10 -Color 'D0C2A4' | Out-Null
  Add-Panel -Slide $slide -Left 54 -Top 114 -Width 392 -Height 320 -FillColor '102746' -LineColor '36506D' | Out-Null
  Add-Panel -Slide $slide -Left 474 -Top 114 -Width 392 -Height 320 -FillColor '102746' -LineColor '36506D' | Out-Null
  Add-Textbox -Slide $slide -Left 76 -Top 138 -Width 160 -Height 20 -Text '首轮建议交付物' -FontSize 18 -Color 'F3DEC0' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 76 -Top 174 -Width 330 -Height 220 -Items @(
    '客户版 AI 工作台',
    '产品知识库初始化',
    '官网 / 文档 / FAQ / Warranty 首批接入',
    '产品问答与客服问答能力',
    '渠道方案 / 产品介绍模板',
    '1 个 ERP / 业务系统只读样板接入',
    '实施文档与管理员培训'
  ) -FontSize 15 -Color 'FFFFFF' | Out-Null
  Add-Textbox -Slide $slide -Left 496 -Top 138 -Width 160 -Height 20 -Text '建议下一步' -FontSize 18 -Color 'F3DEC0' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 496 -Top 174 -Width 330 -Height 220 -Items @(
    '确认一期目标角色：销售 / 市场 / 客服',
    '确认首批资料清单与接入范围',
    '确认一期接入的 ERP / 业务系统样板范围',
    '确认部署方式：本地 / 私有网络 / 服务器',
    '确认后续扩展的 ERP / 电商 / 售后数据范围',
    '进入实施排期与样板库搭建'
  ) -FontSize 15 -Color 'FFFFFF' | Out-Null
  Add-Textbox -Slide $slide -Left 84 -Top 456 -Width 760 -Height 28 -Text '结论：AI Data Platform 适合作为 Divoom 产品知识、内容资产、渠道支撑与经营分析的一体化底座。' -FontSize 18 -Color 'FFFFFF' -Bold $true | Out-Null
  Add-Footer -Slide $slide -PageNo 8 -Dark $true

  $presentation.SaveAs($outputPath, $ppSaveAsOpenXMLPresentation)
  $presentation.Close()
  $app.Quit()

  Write-Output $outputPath
} catch {
  if ($presentation) { try { $presentation.Close() } catch {} }
  if ($app) { try { $app.Quit() } catch {} }
  throw
}
