$ErrorActionPreference = 'Stop'

$outputPath = 'C:\Users\soulzyn\Desktop\AI Data Platform项目方案_Divoom_客户版_V3_销售型_2026-03-30.pptx'

$ppLayoutBlank = 12
$ppSlideSizeOnScreen16x9 = 15
$ppSaveAsOpenXMLPresentation = 24
$msoFalse = 0
$msoTrue = -1
$msoTextOrientationHorizontal = 1

function Set-SlideBackground {
  param($Slide, [string]$Color)
  $Slide.FollowMasterBackground = $msoFalse
  $Slide.Background.Fill.Visible = $msoTrue
  $Slide.Background.Fill.Solid()
  $Slide.Background.Fill.ForeColor.RGB = [int]("0x$Color")
}

function Add-TopBar {
  param($Slide, [string]$Color = '41230B')
  $shape = $Slide.Shapes.AddShape(1, 0, 0, 960, 12)
  $shape.Fill.Solid()
  $shape.Fill.ForeColor.RGB = [int]("0x$Color")
  $shape.Line.Visible = $msoFalse
}

function Add-Footer {
  param($Slide, [int]$PageNo, [bool]$Dark = $false)
  $color = if ($Dark) { 'D8C9AA' } else { '7A6B5A' }
  $left = $Slide.Shapes.AddTextbox($msoTextOrientationHorizontal, 24, 510, 330, 18)
  $left.TextFrame.TextRange.Text = 'AI Data Platform · Divoom 客户方案 V3'
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

  # 1 Cover
  $slide = $presentation.Slides.Add(1, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color '0B2341'
  Add-TopBar -Slide $slide -Color 'D9B36B'
  Add-Panel -Slide $slide -Left 650 -Top 12 -Width 310 -Height 528 -FillColor '143A66' -LineColor '143A66' | Out-Null
  Add-Textbox -Slide $slide -Left 62 -Top 56 -Width 240 -Height 20 -Text 'AI Data Platform' -FontSize 20 -Color 'F3DEC0' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 62 -Top 108 -Width 420 -Height 34 -Text 'Divoom AI 智能协同平台' -FontSize 30 -Color 'FFFFFF' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 62 -Top 156 -Width 420 -Height 24 -Text '商业与产品解决方案书' -FontSize 20 -Color 'DBE7F4' | Out-Null
  Add-Textbox -Slide $slide -Left 62 -Top 228 -Width 520 -Height 54 -Text '以产品知识为底座，以 ERP 与多电商平台后台数据整合为核心价值的企业级 AI 智能协同平台' -FontSize 20 -Color 'F3DEC0' -Bold $true | Out-Null
  Add-Panel -Slide $slide -Left 62 -Top 320 -Width 560 -Height 108 -FillColor '123154' -LineColor '295487' | Out-Null
  Add-BulletBox -Slide $slide -Left 82 -Top 342 -Width 510 -Height 78 -Items @(
    '不替代官网、App、ERP、电商后台，而是在其之上增加统一 AI 协同层',
    '同时服务销售、市场、客服与管理层',
    '让知识资产与经营数据统一接入、统一理解、统一输出'
  ) -FontSize 15 -Color 'FFFFFF' | Out-Null
  Add-Textbox -Slide $slide -Left 62 -Top 468 -Width 180 -Height 20 -Text '2026.03 · 客户版 V3' -FontSize 16 -Color 'F3DEC0' | Out-Null
  Add-Footer -Slide $slide -PageNo 1 -Dark $true

  # 2 why now
  $slide = $presentation.Slides.Add(2, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 460 -Height 24 -Text '01 为什么 Divoom 现在需要这样一层平台' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 36 -Top 60 -Width 560 -Height 18 -Text '因为客户的问题不是系统不够多，而是系统之间没有智能协同层' -FontSize 10 -Color '64748B' | Out-Null
  Add-Panel -Slide $slide -Left 36 -Top 102 -Width 420 -Height 342 -FillColor 'EEF4FB' | Out-Null
  Add-Textbox -Slide $slide -Left 56 -Top 126 -Width 220 -Height 20 -Text 'Divoom 的业务本质是复合生态' -FontSize 18 -Color '0B2341' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 56 -Top 164 -Width 370 -Height 244 -Items @(
    'Pixel art 硬件产品',
    '蓝牙音箱 / 显示设备',
    'Divoom Smart App',
    '社区内容与创作生态',
    'FAQ、Warranty、Certificate、Media 等完整内容体系',
    '全球渠道和多区域市场运营'
  ) -FontSize 15 -Color '203040' | Out-Null
  Add-Panel -Slide $slide -Left 490 -Top 102 -Width 430 -Height 342 -FillColor 'F7F9FC' | Out-Null
  Add-Textbox -Slide $slide -Left 510 -Top 126 -Width 220 -Height 20 -Text '由此带来的核心问题' -FontSize 18 -Color '0B2341' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 510 -Top 164 -Width 380 -Height 244 -Items @(
    '产品资料、市场资料、客服知识、渠道文档分散',
    '销售、市场、客服、渠道输出口径不一致',
    'ERP 与多个电商后台数据难以统一看业务',
    '新品、展会、FAQ、培训内容反复重做',
    '产品知识与经营数据长期割裂'
  ) -FontSize 15 -Color '203040' | Out-Null
  Add-Footer -Slide $slide -PageNo 2

  # 3 pain
  $slide = $presentation.Slides.Add(3, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 360 -Height 24 -Text '02 客户当前最直接的业务痛点' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  $painCards = @(
    @{x=36;y=104;t='资料孤岛';b='官网、说明书、FAQ、证书、渠道资料分散，团队反复找资料'},
    @{x=332;y=104;t='口径不一';b='同一产品在销售、市场、客服、渠道中有多版本表达'},
    @{x=628;y=104;t='数据割裂';b='ERP 与多个电商后台各自独立，难统一看经营状态'},
    @{x=36;y=270;t='分析滞后';b='跨平台经营分析依赖导表、汇总、人工解释，速度慢'},
    @{x=332;y=270;t='内容重做';b='新品介绍、FAQ、招商资料、培训材料不断重复生产'},
    @{x=628;y=270;t='协同低效';b='知识与数据无法在销售、客服、管理之间自然流转'}
  )
  foreach ($c in $painCards) {
    Add-Panel -Slide $slide -Left $c.x -Top $c.y -Width 260 -Height 120 -FillColor 'F7F9FC' | Out-Null
    Add-Textbox -Slide $slide -Left ($c.x + 16) -Top ($c.y + 16) -Width 150 -Height 20 -Text $c.t -FontSize 18 -Color '0B2341' -Bold $true | Out-Null
    Add-Textbox -Slide $slide -Left ($c.x + 16) -Top ($c.y + 46) -Width 220 -Height 56 -Text $c.b -FontSize 13 -Color '203040' | Out-Null
  }
  Add-Footer -Slide $slide -PageNo 3

  # 4 answer
  $slide = $presentation.Slides.Add(4, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color '0B2341'
  Add-TopBar -Slide $slide -Color 'D9B36B'
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 420 -Height 24 -Text '03 我们的回答：不是重构系统，而是加一层 AI 协同层' -FontSize 24 -Color 'FFFFFF' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 36 -Top 70 -Width 760 -Height 40 -Text '在现有官网、App、ERP 和多电商平台后台之上，建立统一的智能操作与知识协同层。' -FontSize 20 -Color 'F3DEC0' -Bold $true | Out-Null
  Add-Panel -Slide $slide -Left 56 -Top 140 -Width 848 -Height 268 -FillColor '123154' -LineColor '295487' | Out-Null
  Add-BulletBox -Slide $slide -Left 82 -Top 170 -Width 790 -Height 190 -Items @(
    '不替代原系统，不推翻已有投资',
    '优先通过只读、非侵入式方式接入知识和数据资产',
    '把复杂的数据访问和资料查找，重构为自然语言问答、模板输出和自动分析',
    '让销售、市场、客服、管理层都从同一平台获得各自可用的结果',
    '让产品知识与 ERP / 多电商平台经营数据在同一工作台中形成统一出口'
  ) -FontSize 17 -Color 'FFFFFF' | Out-Null
  Add-Footer -Slide $slide -PageNo 4 -Dark $true

  # 5 architecture
  $slide = $presentation.Slides.Add(5, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 300 -Height 24 -Text '04 平台总体架构' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  $arch = @(
    @{x=36;t='多源接入层';b='官网`r文档`rFAQ / Warranty`rERP`r多电商平台后台'},
    @{x=216;t='解析理解层';b='文本抽取`rOCR fallback`rquick parse`rdeep parse`rstructured profile'},
    @{x=396;t='智能检索/路由';b='知识检索`r数据查询`r证据召回`r任务分流`r复合供料'},
    @{x=576;t='模板输出层';b='产品介绍`rFAQ`r渠道方案`r日报周报`rPPT / 页面 / 表格'},
    @{x=756;t='工作台层';b='AI 工作台`r文档中心`r数据源台`r报表中心`r审计权限'}
  )
  foreach ($a in $arch) {
    Add-Panel -Slide $slide -Left $a.x -Top 155 -Width 150 -Height 186 -FillColor 'EEF4FB' | Out-Null
    Add-Textbox -Slide $slide -Left ($a.x + 8) -Top 174 -Width 134 -Height 18 -Text $a.t -FontSize 16 -Color '0B2341' -Bold $true | Out-Null
    Add-Textbox -Slide $slide -Left ($a.x + 10) -Top 208 -Width 130 -Height 112 -Text $a.b -FontSize 12 -Color '203040' | Out-Null
  }
  Add-Textbox -Slide $slide -Left 190 -Top 238 -Width 18 -Height 18 -Text '→' -FontSize 28 -Color '2156D9' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 370 -Top 238 -Width 18 -Height 18 -Text '→' -FontSize 28 -Color '2156D9' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 550 -Top 238 -Width 18 -Height 18 -Text '→' -FontSize 28 -Color '2156D9' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 730 -Top 238 -Width 18 -Height 18 -Text '→' -FontSize 28 -Color '2156D9' -Bold $true | Out-Null
  Add-Panel -Slide $slide -Left 96 -Top 386 -Width 760 -Height 50 -FillColor 'FFF8EC' -LineColor 'E4C98D' | Out-Null
  Add-Textbox -Slide $slide -Left 118 -Top 404 -Width 720 -Height 18 -Text '平台真正的价值，在于把知识和数据统一接入、统一理解、统一输出，而不是只增加一个聊天入口。' -FontSize 16 -Color '7A5418' -Bold $true | Out-Null
  Add-Footer -Slide $slide -PageNo 5

  # 6 ERP and ecommerce core
  $slide = $presentation.Slides.Add(6, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 450 -Height 24 -Text '05 ERP 与多电商平台后台，是本项目的核心价值点' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  Add-Panel -Slide $slide -Left 36 -Top 102 -Width 300 -Height 350 -FillColor 'EEF4FB' | Out-Null
  Add-Textbox -Slide $slide -Left 56 -Top 126 -Width 180 -Height 20 -Text '为什么它是核心' -FontSize 18 -Color '0B2341' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 56 -Top 164 -Width 250 -Height 250 -Items @(
    '知识库解决“资料问题”',
    'ERP 与电商后台接入解决“经营问题”',
    '两者合并后，平台从知识工具升级为经营协同平台',
    '这是客户最容易感知到价值的部分'
  ) -FontSize 15 -Color '203040' | Out-Null
  Add-Panel -Slide $slide -Left 360 -Top 102 -Width 560 -Height 350 -FillColor 'F7F9FC' | Out-Null
  Add-Textbox -Slide $slide -Left 382 -Top 126 -Width 260 -Height 20 -Text '统一接入的后台范围' -FontSize 18 -Color '0B2341' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 382 -Top 164 -Width 510 -Height 250 -Items @(
    'ERP',
    '淘宝 / 天猫、京东、拼多多、抖音电商、快手电商',
    '亚马逊、Shopify / 独立站、Shopee、Lazada、TikTok Shop 等海外平台',
    '订单、库存、退款、售后、销售汇总等后台数据统一接入',
    '通过统一工作台完成查询、对比、解释、日报和管理汇报输出'
  ) -FontSize 15 -Color '203040' | Out-Null
  Add-Footer -Slide $slide -PageNo 6

  # 7 actual system capability
  $slide = $presentation.Slides.Add(7, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 420 -Height 24 -Text '06 我们系统现在已经具备的能力底座' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 36 -Top 60 -Width 540 -Height 18 -Text '不是纸面方案，而是已经具备客户化收敛能力的工作台基础' -FontSize 10 -Color '64748B' | Out-Null
  $caps = @(
    @{x=36;y=102;t='文档主线';b='上传、落盘、quick parse、deep parse、自动入库、混合检索'},
    @{x=332;y=102;t='知识理解';b='摘要、structured profile、schemaType、技术 / 合同 / 通用类结构化'},
    @{x=628;y=102;t='AI 工作台';b='单入口问答、按库回答、最近资料追问、模板输出'},
    @{x=36;y=270;t='数据源台';b='数据源定义、采集任务、网页类数据源、数据库 / ERP 类型数据源框架'},
    @{x=332;y=270;t='报表输出';b='共享模板库、表格 / 页面 / PPT 输出能力'},
    @{x=628;y=270;t='技术底座';b='Web + API + Worker 三层结构，适合继续做客户版落地'}
  )
  foreach ($c in $caps) {
    Add-Panel -Slide $slide -Left $c.x -Top $c.y -Width 260 -Height 120 -FillColor 'F7F9FC' | Out-Null
    Add-Textbox -Slide $slide -Left ($c.x + 16) -Top ($c.y + 16) -Width 150 -Height 20 -Text $c.t -FontSize 18 -Color '0B2341' -Bold $true | Out-Null
    Add-Textbox -Slide $slide -Left ($c.x + 16) -Top ($c.y + 46) -Width 220 -Height 54 -Text $c.b -FontSize 13 -Color '203040' | Out-Null
  }
  Add-Footer -Slide $slide -PageNo 7

  # 8 MVP
  $slide = $presentation.Slides.Add(8, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 420 -Height 24 -Text '07 更贴近客户的一期 MVP 设计' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 36 -Top 60 -Width 620 -Height 18 -Text '一期就同时验证知识价值、数据价值和管理价值' -FontSize 10 -Color '64748B' | Out-Null
  Add-Panel -Slide $slide -Left 54 -Top 104 -Width 812 -Height 74 -FillColor '123154' -LineColor '295487' | Out-Null
  Add-Textbox -Slide $slide -Left 84 -Top 130 -Width 748 -Height 22 -Text '产品知识中台 + 1 个 ERP 接入 + 2~3 个核心电商平台后台接入' -FontSize 22 -Color 'FFFFFF' -Bold $true | Out-Null
  Add-Panel -Slide $slide -Left 54 -Top 204 -Width 250 -Height 224 -FillColor 'EEF4FB' | Out-Null
  Add-Textbox -Slide $slide -Left 72 -Top 226 -Width 120 -Height 20 -Text '知识侧' -FontSize 18 -Color '0B2341' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 72 -Top 260 -Width 200 -Height 140 -Items @(
    '官网产品页',
    '说明书 / 参数表',
    'FAQ / Warranty',
    'Certificate',
    '渠道与市场资料'
  ) -FontSize 15 -Color '203040' | Out-Null
  Add-Panel -Slide $slide -Left 336 -Top 204 -Width 250 -Height 224 -FillColor 'F7F9FC' | Out-Null
  Add-Textbox -Slide $slide -Left 354 -Top 226 -Width 120 -Height 20 -Text '数据侧' -FontSize 18 -Color '0B2341' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 354 -Top 260 -Width 200 -Height 140 -Items @(
    '1 个 ERP',
    '2~3 个核心电商平台后台',
    '订单 / 库存 / 销售汇总',
    '退款 / 售后样板数据'
  ) -FontSize 15 -Color '203040' | Out-Null
  Add-Panel -Slide $slide -Left 618 -Top 204 -Width 248 -Height 224 -FillColor 'EEF4FB' | Out-Null
  Add-Textbox -Slide $slide -Left 636 -Top 226 -Width 120 -Height 20 -Text '一期可演示结果' -FontSize 18 -Color '0B2341' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 636 -Top 260 -Width 198 -Height 140 -Items @(
    '产品问答',
    'FAQ / Warranty 输出',
    '多平台经营查询',
    '日报 / 对比分析 / 渠道方案'
  ) -FontSize 15 -Color '203040' | Out-Null
  Add-Footer -Slide $slide -PageNo 8

  # 9 before after
  $slide = $presentation.Slides.Add(9, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 320 -Height 24 -Text '08 过去 vs 现在' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  Add-Panel -Slide $slide -Left 54 -Top 102 -Width 386 -Height 350 -FillColor 'FFF8EC' -LineColor 'E4C98D' | Out-Null
  Add-Panel -Slide $slide -Left 480 -Top 102 -Width 386 -Height 350 -FillColor 'EEF4FB' | Out-Null
  Add-Textbox -Slide $slide -Left 74 -Top 126 -Width 80 -Height 20 -Text '过去' -FontSize 20 -Color '7A5418' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 74 -Top 164 -Width 336 -Height 250 -Items @(
    '找产品资料要翻官网、文档、FAQ、问同事',
    '看经营数据要切 ERP 和多个平台后台',
    '跨平台对比依赖导表和手工汇总',
    '销售、市场、客服各自维护一套资料',
    '管理层只能看到滞后的结果报表'
  ) -FontSize 16 -Color '7A5418' | Out-Null
  Add-Textbox -Slide $slide -Left 500 -Top 126 -Width 80 -Height 20 -Text '现在' -FontSize 20 -Color '0B2341' -Bold $true | Out-Null
  Add-BulletBox -Slide $slide -Left 500 -Top 164 -Width 336 -Height 250 -Items @(
    '一句话问产品，一句话问 FAQ / Warranty',
    '一句话问 ERP 和多个电商平台后台数据',
    '统一完成查询、对比、解释和输出',
    '同一平台同时服务销售、市场、客服、管理层',
    '从“人找资料 / 人拉表”变成“平台统一供给结果”'
  ) -FontSize 16 -Color '203040' | Out-Null
  Add-Footer -Slide $slide -PageNo 9

  # 10 role output
  $slide = $presentation.Slides.Add(10, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 420 -Height 24 -Text '09 同一平台服务四类核心角色' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  $roles = @(
    @{x=36;y=104;t='销售';b='产品方案、客户提案、SKU 对比、渠道介绍'},
    @{x=332;y=104;t='市场';b='新品页、展会资料、媒体摘要、招商内容'},
    @{x=628;y=104;t='客服';b='FAQ 标准答复、售后定位、版本差异说明'},
    @{x=184;y=270;t='管理层';b='ERP + 多平台经营分析、日报、周报、管理汇报'},
    @{x=480;y=270;t='统一输出';b='问答、表格、页面、PPT、经营报告、自动摘要'}
  )
  foreach ($r in $roles) {
    Add-Panel -Slide $slide -Left $r.x -Top $r.y -Width 260 -Height 120 -FillColor 'F7F9FC' | Out-Null
    Add-Textbox -Slide $slide -Left ($r.x + 16) -Top ($r.y + 16) -Width 100 -Height 20 -Text $r.t -FontSize 18 -Color '2156D9' -Bold $true | Out-Null
    Add-Textbox -Slide $slide -Left ($r.x + 16) -Top ($r.y + 50) -Width 220 -Height 48 -Text $r.b -FontSize 13 -Color '203040' | Out-Null
  }
  Add-Footer -Slide $slide -PageNo 10

  # 11 moats
  $slide = $presentation.Slides.Add(11, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color '0B2341'
  Add-TopBar -Slide $slide -Color 'D9B36B'
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 340 -Height 24 -Text '10 我们的三大护城河' -FontSize 24 -Color 'FFFFFF' -Bold $true | Out-Null
  $moats = @(
    @{x=56;t='零改造 / 非侵入式';b='不推翻官网、ERP、电商后台，最大化保护客户历史投资'},
    @{x=336;t='知识 + 数据统一出口';b='不是单一知识库，也不是单一 BI，而是统一协同平台'},
    @{x=616;t='多角色、多输出形态';b='既能问答，也能输出文档、表格、页面和 PPT'}
  )
  foreach ($m in $moats) {
    Add-Panel -Slide $slide -Left $m.x -Top 158 -Width 240 -Height 222 -FillColor '123154' -LineColor '36506D' | Out-Null
    Add-Textbox -Slide $slide -Left ($m.x + 16) -Top 182 -Width 190 -Height 40 -Text $m.t -FontSize 20 -Color 'F3DEC0' -Bold $true | Out-Null
    Add-Textbox -Slide $slide -Left ($m.x + 16) -Top 244 -Width 198 -Height 94 -Text $m.b -FontSize 14 -Color 'FFFFFF' | Out-Null
  }
  Add-Footer -Slide $slide -PageNo 11 -Dark $true

  # 12 roadmap
  $slide = $presentation.Slides.Add(12, $ppLayoutBlank)
  Set-SlideBackground -Slide $slide -Color 'FFFFFF'
  Add-TopBar -Slide $slide
  Add-Textbox -Slide $slide -Left 36 -Top 28 -Width 360 -Height 24 -Text '11 三阶段实施路径与收口' -FontSize 24 -Color '0B2341' -Bold $true | Out-Null
  $phases = @(
    @{x=70;t='Phase 1';s='当前 MVP';fill='EAF2FF';items=@('产品知识中台','FAQ / Warranty / Certificate','1 个 ERP','2~3 个核心电商平台后台','日报 / 对比分析 / 渠道模板')},
    @{x=340;t='Phase 2';s='业务协同';fill='F5F9FF';items=@('扩展更多平台与后台','增加售后 / 客诉 / 库存深度分析','扩展更多角色模板','建立部门级分析与汇报机制')},
    @{x=610;t='Phase 3';s='全栈智能';fill='FFF9EF';items=@('全量系统扩展','自动报告','跨部门工作流联动','更高层经营分析与决策支持')}
  )
  foreach ($p in $phases) {
    Add-Panel -Slide $slide -Left $p.x -Top 118 -Width 240 -Height 270 -FillColor $p.fill | Out-Null
    Add-Textbox -Slide $slide -Left ($p.x + 16) -Top 138 -Width 80 -Height 20 -Text $p.t -FontSize 20 -Color '0B2341' -Bold $true | Out-Null
    Add-Textbox -Slide $slide -Left ($p.x + 136) -Top 142 -Width 70 -Height 16 -Text $p.s -FontSize 11 -Color '64748B' | Out-Null
    Add-BulletBox -Slide $slide -Left ($p.x + 16) -Top 178 -Width 205 -Height 178 -Items $p.items -FontSize 14 -Color '203040' | Out-Null
  }
  Add-Textbox -Slide $slide -Left 322 -Top 226 -Width 18 -Height 18 -Text '→' -FontSize 28 -Color '2156D9' -Bold $true | Out-Null
  Add-Textbox -Slide $slide -Left 592 -Top 226 -Width 18 -Height 18 -Text '→' -FontSize 28 -Color '2156D9' -Bold $true | Out-Null
  Add-Panel -Slide $slide -Left 92 -Top 418 -Width 746 -Height 64 -FillColor '123154' -LineColor '295487' | Out-Null
  Add-Textbox -Slide $slide -Left 120 -Top 442 -Width 690 -Height 20 -Text '结论：我们不是再给 Divoom 增加一个系统，而是增加一层能把产品知识、ERP 和多电商后台数据真正串起来的智能协同层。' -FontSize 16 -Color 'FFFFFF' -Bold $true | Out-Null
  Add-Footer -Slide $slide -PageNo 12

  $presentation.SaveAs($outputPath, $ppSaveAsOpenXMLPresentation)
  $presentation.Close()
  $app.Quit()
  Write-Output $outputPath
} catch {
  if ($presentation) { try { $presentation.Close() } catch {} }
  if ($app) { try { $app.Quit() } catch {} }
  throw
}
