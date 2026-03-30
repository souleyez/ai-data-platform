from __future__ import annotations

import csv
import random
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path


ASSET_DIR = Path(__file__).resolve().parents[1] / "default-samples" / "assets"


def weighted_choice(rng: random.Random, seq, weights):
    total = sum(weights)
    pick = rng.random() * total
    upto = 0.0
    for item, weight in zip(seq, weights):
        upto += weight
        if upto >= pick:
            return item
    return seq[-1]


def build_assets() -> dict[str, int | list[str]]:
    rng = random.Random(20260330)
    ASSET_DIR.mkdir(parents=True, exist_ok=True)

    platforms = [
        {
            "name": "Tmall",
            "shop": "天猫旗舰店",
            "share": 0.24,
            "discount": (0.03, 0.12),
            "traffic": ["搜索", "店播", "会员复购"],
            "customer": ["新客", "老客", "会员"],
        },
        {
            "name": "JD",
            "shop": "京东自营店",
            "share": 0.18,
            "discount": (0.02, 0.08),
            "traffic": ["站内推荐", "企业团购", "搜索"],
            "customer": ["企业客户", "老客", "新客"],
        },
        {
            "name": "Douyin",
            "shop": "抖音直播间",
            "share": 0.28,
            "discount": (0.05, 0.18),
            "traffic": ["达人直播", "短视频种草", "信息流"],
            "customer": ["新客", "冲动购", "粉丝"],
        },
        {
            "name": "Pinduoduo",
            "shop": "拼多多店铺",
            "share": 0.14,
            "discount": (0.08, 0.22),
            "traffic": ["活动会场", "自然流量", "百亿补贴"],
            "customer": ["价格敏感", "新客", "老客"],
        },
        {
            "name": "Kuaishou",
            "shop": "快手品牌号",
            "share": 0.08,
            "discount": (0.06, 0.16),
            "traffic": ["主播连麦", "短视频挂车", "粉丝群"],
            "customer": ["粉丝", "新客", "复购客"],
        },
        {
            "name": "WeChatMall",
            "shop": "微信小程序商城",
            "share": 0.08,
            "discount": (0.01, 0.10),
            "traffic": ["社群团购", "朋友圈", "私域复购"],
            "customer": ["会员", "老客", "团购"],
        },
    ]
    regions = ["华东", "华南", "华北", "西南", "华中", "东北"]
    warehouses = ["华东仓", "华南仓", "华北仓", "西南仓"]
    payment_channels = ["支付宝", "微信支付", "京东支付", "云闪付"]
    promo_types = ["日常销售", "平台大促", "新品上新", "直播专场", "会员日", "清仓促销"]

    categories = [
        {
            "name": "手机配件",
            "skus": [
                {"sku": "PD快充头20W", "price": 79, "cost": 31, "weight": 1.4},
                {"sku": "GaN氮化镓快充头30W", "price": 119, "cost": 45, "weight": 1.2},
                {"sku": "磁吸无线充15W", "price": 159, "cost": 63, "weight": 1.0},
                {"sku": "编织数据线Type-C 2m", "price": 49, "cost": 16, "weight": 0.9},
            ],
        },
        {
            "name": "耳机",
            "skus": [
                {"sku": "主动降噪蓝牙耳机Pro", "price": 329, "cost": 162, "weight": 1.5},
                {"sku": "运动耳机Lite", "price": 199, "cost": 86, "weight": 1.2},
                {"sku": "开放式耳夹耳机Air", "price": 269, "cost": 117, "weight": 1.1},
            ],
        },
        {
            "name": "智能穿戴",
            "skus": [
                {"sku": "运动手表Lite", "price": 399, "cost": 188, "weight": 1.1},
                {"sku": "旗舰手表X1", "price": 899, "cost": 452, "weight": 0.9},
                {"sku": "儿童手表Lite", "price": 499, "cost": 236, "weight": 0.8},
            ],
        },
        {
            "name": "智能家居",
            "skus": [
                {"sku": "智能插座双口版", "price": 69, "cost": 27, "weight": 1.3},
                {"sku": "智能摄像头云台版", "price": 259, "cost": 121, "weight": 1.0},
                {"sku": "智能门锁青春版", "price": 1299, "cost": 718, "weight": 0.6},
                {"sku": "RGB氛围灯条", "price": 99, "cost": 38, "weight": 0.8},
            ],
        },
        {
            "name": "平板周边",
            "skus": [
                {"sku": "磁吸键盘Air", "price": 349, "cost": 162, "weight": 1.0},
                {"sku": "手写笔Pro", "price": 229, "cost": 97, "weight": 0.9},
                {"sku": "折叠支架Max", "price": 129, "cost": 52, "weight": 0.8},
            ],
        },
        {
            "name": "电脑外设",
            "skus": [
                {"sku": "机械键盘84配列", "price": 299, "cost": 141, "weight": 1.0},
                {"sku": "无线鼠标静音版", "price": 139, "cost": 54, "weight": 1.1},
                {"sku": "USB-C扩展坞7合1", "price": 239, "cost": 112, "weight": 0.9},
            ],
        },
    ]

    category_weights = {
        "手机配件": 0.20,
        "耳机": 0.22,
        "智能穿戴": 0.16,
        "智能家居": 0.18,
        "平板周边": 0.12,
        "电脑外设": 0.12,
    }
    platform_bias = {
        "Tmall": {"智能穿戴": 1.2, "平板周边": 1.2, "智能门锁青春版": 0.8},
        "JD": {"电脑外设": 1.3, "平板周边": 1.2, "智能门锁青春版": 1.2},
        "Douyin": {"耳机": 1.35, "智能穿戴": 1.3, "RGB氛围灯条": 1.2},
        "Pinduoduo": {"手机配件": 1.25, "智能家居": 1.2, "旗舰手表X1": 0.55},
        "Kuaishou": {"耳机": 1.25, "手机配件": 1.1, "智能门锁青春版": 0.7},
        "WeChatMall": {"智能穿戴": 1.25, "智能家居": 1.1, "旗舰手表X1": 1.2},
    }

    sku_meta: dict[str, dict[str, object]] = {}
    for category in categories:
        for sku in category["skus"]:
            sku_meta[sku["sku"]] = {**sku, "category": category["name"]}

    platform_names = [p["name"] for p in platforms]
    platform_weights = [p["share"] for p in platforms]
    category_names = [c["name"] for c in categories]
    category_base_weights = [category_weights[c["name"]] for c in categories]

    def platform_profile(name: str) -> dict[str, object]:
        return next(item for item in platforms if item["name"] == name)

    def choose_category(platform_name: str) -> str:
        bias = platform_bias.get(platform_name, {})
        weights = [base * float(bias.get(name, 1.0)) for name, base in zip(category_names, category_base_weights)]
        return weighted_choice(rng, category_names, weights)

    def choose_sku(platform_name: str, category_name: str) -> dict[str, object]:
        skus = next(item["skus"] for item in categories if item["name"] == category_name)
        bias = platform_bias.get(platform_name, {})
        weights = [float(sku["weight"]) * float(bias.get(sku["sku"], 1.0)) for sku in skus]
        return weighted_choice(rng, skus, weights)

    start = date(2026, 1, 1)
    end = date(2026, 3, 31)
    day_span = (end - start).days + 1
    orders: list[dict[str, object]] = []
    sku_stats = defaultdict(
        lambda: {
            "units": 0,
            "net": 0.0,
            "gross_profit": 0.0,
            "returns": 0,
            "order_count": 0,
            "platforms": defaultdict(lambda: {"orders": 0, "units": 0, "net": 0.0}),
        },
    )
    monthly_channel = defaultdict(
        lambda: {
            "orders": 0,
            "units": 0,
            "net": 0.0,
            "discount": 0.0,
            "refund": 0.0,
            "gross_profit": 0.0,
        },
    )

    for index in range(1, 1001):
        platform_name = weighted_choice(rng, platform_names, platform_weights)
        profile = platform_profile(platform_name)
        category_name = choose_category(platform_name)
        sku = choose_sku(platform_name, category_name)
        order_day = start + timedelta(days=rng.randrange(day_span))
        region = weighted_choice(rng, regions, [0.26, 0.24, 0.17, 0.14, 0.12, 0.07])
        warehouse = weighted_choice(rng, warehouses, [0.34, 0.29, 0.22, 0.15])
        payment = weighted_choice(rng, payment_channels, [0.34, 0.42, 0.14, 0.10])
        promo = weighted_choice(rng, promo_types, [0.34, 0.18, 0.12, 0.16, 0.10, 0.10])
        traffic = weighted_choice(rng, profile["traffic"], [0.45, 0.35, 0.20])
        customer = weighted_choice(rng, profile["customer"], [0.42, 0.35, 0.23])

        unit_price = int(sku["price"])
        unit_cost = int(sku["cost"])
        if unit_price < 100:
            quantity = weighted_choice(rng, [1, 2, 3, 4, 5, 6], [22, 34, 23, 11, 6, 4])
        elif unit_price < 400:
            quantity = weighted_choice(rng, [1, 2, 3, 4], [48, 31, 15, 6])
        else:
            quantity = weighted_choice(rng, [1, 2, 3], [72, 22, 6])

        gross = unit_price * quantity
        discount_rate = rng.uniform(*profile["discount"])
        if promo in ("平台大促", "直播专场"):
            discount_rate += 0.03
        if platform_name == "Pinduoduo":
            discount_rate += 0.02
        discount = round(gross * min(discount_rate, 0.28), 2)
        refund_flag = rng.random() < (0.06 if platform_name in ("Douyin", "Pinduoduo", "Kuaishou") else 0.03)
        refund_amount = round((gross - discount) * rng.uniform(0.25, 1.0), 2) if refund_flag else 0.0
        shipping_fee = round(weighted_choice(rng, [0, 0, 0, 6, 8, 10], [1, 1, 1, 1, 1, 1]), 2)
        net = round(gross - discount - refund_amount + shipping_fee, 2)
        cogs = round(unit_cost * quantity, 2)
        gross_profit = round(net - cogs, 2)
        inventory_before = rng.randint(max(quantity + 12, 20), max(quantity + 90, 120))
        inventory_after = max(inventory_before - quantity, 0)
        if inventory_after < 15:
            inventory_risk = "stockout_risk"
        elif inventory_after > inventory_before * 0.75 and category_name == "智能家居":
            inventory_risk = "overstock_risk"
        else:
            inventory_risk = "healthy"

        anomaly_note = ""
        if promo == "直播专场" and platform_name in ("Douyin", "Kuaishou") and quantity >= 3:
            anomaly_note = "直播专场拉动单笔多件成交"
        elif refund_flag and platform_name in ("Pinduoduo", "Douyin"):
            anomaly_note = "活动后退款偏高，需复盘详情页和售后承诺"
        elif inventory_risk == "stockout_risk" and unit_price >= 299:
            anomaly_note = "高客单SKU库存吃紧，建议优先补货"
        elif inventory_risk == "overstock_risk":
            anomaly_note = "智能家居尾货周转偏慢，建议控货清仓"

        order_id = f"ORD2026{order_day.strftime('%m%d')}{index:04d}"
        row = {
            "order_id": order_id,
            "order_date": order_day.isoformat(),
            "platform": platform_name,
            "shop_name": profile["shop"],
            "region": region,
            "category": category_name,
            "sku": sku["sku"],
            "unit_price": unit_price,
            "quantity": quantity,
            "gross_amount": round(gross, 2),
            "discount_amount": discount,
            "refund_amount": refund_amount,
            "net_amount": net,
            "gross_profit": gross_profit,
            "payment_channel": payment,
            "warehouse": warehouse,
            "traffic_source": traffic,
            "promo_type": promo,
            "customer_type": customer,
            "inventory_before": inventory_before,
            "inventory_after": inventory_after,
            "inventory_risk": inventory_risk,
            "anomaly_note": anomaly_note,
        }
        orders.append(row)

        month_key = f"{order_day.year}-{order_day.month:02d}"
        sku_key = sku["sku"]
        sku_stats[sku_key]["units"] += quantity
        sku_stats[sku_key]["net"] += net
        sku_stats[sku_key]["gross_profit"] += gross_profit
        sku_stats[sku_key]["order_count"] += 1
        if refund_flag:
            sku_stats[sku_key]["returns"] += 1
        sku_stats[sku_key]["platforms"][platform_name]["orders"] += 1
        sku_stats[sku_key]["platforms"][platform_name]["units"] += quantity
        sku_stats[sku_key]["platforms"][platform_name]["net"] += net

        monthly_key = (month_key, platform_name, category_name)
        monthly_channel[monthly_key]["orders"] += 1
        monthly_channel[monthly_key]["units"] += quantity
        monthly_channel[monthly_key]["net"] += net
        monthly_channel[monthly_key]["discount"] += discount
        monthly_channel[monthly_key]["refund"] += refund_amount
        monthly_channel[monthly_key]["gross_profit"] += gross_profit

    orders_path = ASSET_DIR / "order-electronics-omni-1000-orders-q1-2026.csv"
    with orders_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(orders[0].keys()))
        writer.writeheader()
        writer.writerows(orders)

    summary_rows: list[dict[str, object]] = []
    for (month_key, platform_name, category_name), stats in sorted(monthly_channel.items()):
        avg_order_value = round(stats["net"] / stats["orders"], 2) if stats["orders"] else 0
        gross_margin = round(stats["gross_profit"] / stats["net"], 4) if stats["net"] else 0
        summary_rows.append(
            {
                "month": month_key,
                "platform": platform_name,
                "category": category_name,
                "order_count": stats["orders"],
                "units_sold": stats["units"],
                "net_sales": round(stats["net"], 2),
                "gross_profit": round(stats["gross_profit"], 2),
                "avg_order_value": avg_order_value,
                "discount_total": round(stats["discount"], 2),
                "refund_total": round(stats["refund"], 2),
                "gross_margin": gross_margin,
            },
        )
    summary_path = ASSET_DIR / "order-channel-category-summary-q1-2026.csv"
    with summary_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(summary_rows[0].keys()))
        writer.writeheader()
        writer.writerows(summary_rows)

    inventory_rows: list[dict[str, object]] = []
    for sku_name, stats in sorted(sku_stats.items(), key=lambda item: item[1]["net"], reverse=True):
        meta = sku_meta[sku_name]
        demand_units = max(int(stats["units"]), 1)
        top_platform = max(stats["platforms"].items(), key=lambda item: item[1]["net"])[0]
        for warehouse in warehouses:
            on_hand = rng.randint(80, 420)
            if meta["category"] == "智能家居":
                on_hand += rng.randint(40, 180)
            if sku_name in ("主动降噪蓝牙耳机Pro", "旗舰手表X1", "磁吸键盘Air"):
                on_hand -= rng.randint(10, 60)
            reserved = rng.randint(8, 55)
            available = max(on_hand - reserved, 0)
            inbound_7d = rng.randint(0, 180)
            monthly_demand = demand_units / 3
            days_of_cover = round(available / max(monthly_demand / 30, 0.8), 1)
            safety_stock = rng.randint(55, 140)
            inventory_index = round(min(max(days_of_cover / 30, 0.25), 1.55), 2)
            if days_of_cover < 14:
                replenishment_priority = "P0"
                risk_flag = "stockout_risk"
                recommendation = "72小时内补货或跨仓调拨"
            elif days_of_cover > 55:
                replenishment_priority = "P2"
                risk_flag = "overstock_risk"
                recommendation = "暂停采购并安排清仓活动"
            else:
                replenishment_priority = "P1"
                risk_flag = "healthy"
                recommendation = "维持常规补货节奏"
            inventory_rows.append(
                {
                    "snapshot_date": "2026-03-31",
                    "platform_focus": top_platform,
                    "warehouse": warehouse,
                    "category": meta["category"],
                    "sku": sku_name,
                    "on_hand": on_hand,
                    "reserved": reserved,
                    "available": available,
                    "inbound_7d": inbound_7d,
                    "safety_stock": safety_stock,
                    "days_of_cover": days_of_cover,
                    "inventory_index": inventory_index,
                    "replenishment_priority": replenishment_priority,
                    "risk_flag": risk_flag,
                    "recommendation": recommendation,
                },
            )
    inventory_path = ASSET_DIR / "order-inventory-snapshot-q1-2026.csv"
    with inventory_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(inventory_rows[0].keys()))
        writer.writeheader()
        writer.writerows(inventory_rows)

    platform_sales = defaultdict(float)
    category_sales = defaultdict(float)
    for order in orders:
        platform_sales[order["platform"]] += float(order["net_amount"])
        category_sales[order["category"]] += float(order["net_amount"])

    top_platforms = sorted(platform_sales.items(), key=lambda item: item[1], reverse=True)
    top_categories = sorted(category_sales.items(), key=lambda item: item[1], reverse=True)
    hero_skus = sorted(sku_stats.items(), key=lambda item: item[1]["net"], reverse=True)[:6]

    notes_path = ASSET_DIR / "order-cockpit-notes-q1-2026.md"
    notes_path.write_text(
        f"""# 2026年Q1多渠道电商订单与库存样本说明

这是一套用于经营驾驶舱和库存分析的合成样本，覆盖 2026-01-01 到 2026-03-31 共 **1000** 笔订单，渠道包含天猫、京东、抖音、拼多多、快手和微信小程序商城。

## 样本文件
- `order-electronics-omni-1000-orders-q1-2026.csv`：1000 笔订单明细，包含平台、区域、SKU、金额、折扣、退款、库存前后变化、流量来源和异常说明。
- `order-channel-category-summary-q1-2026.csv`：按月、按平台、按品类汇总的经营结果，用于快速出驾驶舱。
- `order-inventory-snapshot-q1-2026.csv`：截至 2026-03-31 的 SKU 库存快照，用于缺货/压货判断。

## 渠道画像
- 天猫：承担品牌稳定成交和高客单组合成交，适合观察利润率与会员复购。
- 京东：偏企业采购和高履约要求，适合观察高客单和交付稳定性。
- 抖音：承担新品放量和直播种草，适合观察爆款放大与峰值异常。
- 拼多多：承担低价冲量与尾货清理，适合观察库存压力和退款风险。
- 快手：偏主播带货与粉丝成交，适合观察内容场景对耳机和配件的放大效应。
- 微信小程序：偏私域复购和会员团购，适合观察高客单与复购结构。

## 核心观察
- Q1 GMV 前三渠道：{", ".join(f"{name}（{value:,.0f}）" for name, value in top_platforms[:3])}。
- 销售额前三品类：{", ".join(f"{name}（{value:,.0f}）" for name, value in top_categories[:3])}。
- Hero SKU：{", ".join(name for name, _ in hero_skus[:4])}。
- 智能家居和部分长尾配件被刻意设置为库存偏高场景，方便验证“高库存 SKU / 补货优先级 / 渠道角色分化”类页面。
- 抖音、快手、拼多多保留了更高的促销折扣和退款概率，方便测试异常波动解释。

## 推荐测试问法
- 基于订单分析知识库全部材料，生成多渠道多 SKU 经营驾驶舱静态页。
- 基于订单分析知识库全部材料，生成库存与补货驾驶舱。
- 对比 Q1 各渠道净销售额、毛利和库存健康情况。
- 列出高风险 SKU 的库存覆盖天数、补货优先级和建议动作。
""",
        encoding="utf-8",
    )

    return {
        "orders": len(orders),
        "summary_rows": len(summary_rows),
        "inventory_rows": len(inventory_rows),
        "files": [orders_path.name, summary_path.name, inventory_path.name, notes_path.name],
    }


if __name__ == "__main__":
    print(build_assets())
