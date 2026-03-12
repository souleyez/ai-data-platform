# API Contract - AI 数据分析中台（前端阶段草案）

## 1. Chat API

### `POST /api/chat`

请求体：

```json
{
  "prompt": "请做订单趋势分析"
}
```

返回体：

```json
{
  "scenario": "order",
  "message": {
    "role": "assistant",
    "content": "...",
    "meta": "来源：..."
  },
  "panel": {
    "reply": "...",
    "source": "...",
    "stats": [],
    "chartTitle": "订单趋势",
    "chartSubtitle": "近 6 个月订单金额模拟图",
    "chartBars": [],
    "tableTitle": "重点下滑客户",
    "tableSubtitle": "按订单额环比下滑排序",
    "rows": []
  }
}
```

## 2. 后续真实接口建议

未来真实后端建议保留相同主结构：

- `message`：聊天回复
- `panel`：右侧图表与表格面板数据
- `sources`：数据来源引用
- `traceId`：调试与审计链路

## 3. 真实化扩展字段建议

后续可以扩展：

```json
{
  "traceId": "trace_xxx",
  "sources": [
    {
      "type": "database",
      "name": "ERP 订单库",
      "table": "orders_view"
    }
  ],
  "permissions": {
    "mode": "read-only"
  },
  "latencyMs": 684
}
```

## 4. 原则

- 前端不拼装分析逻辑
- 面板数据完全由后端/接口返回
- 图表和表格展示与接口协议解耦
