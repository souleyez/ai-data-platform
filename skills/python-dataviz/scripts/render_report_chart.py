import io
import json
import math
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns


PRIMARY = "#0f766e"
ACCENT = "#14b8a6"
GRID = "#d7e3e9"


def normalize_payload():
    raw = json.load(sys.stdin)
    title = str(raw.get("title") or "Data chart").strip() or "Data chart"
    chart_type = str(raw.get("chart_type") or "horizontal-bar").strip() or "horizontal-bar"
    items = []
    for item in raw.get("items") or []:
        label = str((item or {}).get("label") or "").strip()
        if not label:
            continue
        try:
            value = float((item or {}).get("value") or 0)
        except Exception:
            continue
        if not math.isfinite(value):
            continue
        items.append({"label": label[:32], "value": value})
    return title, chart_type, items


def configure_axes(ax, title):
    ax.set_title(title, loc="left", fontsize=14, fontweight="bold", color="#0f172a", pad=14)
    ax.set_facecolor("#ffffff")
    for spine in ["top", "right", "left"]:
        ax.spines[spine].set_visible(False)
    ax.spines["bottom"].set_color("#cbd5e1")
    ax.grid(axis="x", color=GRID, linestyle="--", linewidth=0.8, alpha=0.9)
    ax.tick_params(axis="x", colors="#475569", labelsize=10)
    ax.tick_params(axis="y", colors="#1e293b", labelsize=10)


def render_bar_chart(ax, labels, values, horizontal=True):
    if horizontal:
        positions = list(range(len(labels)))
        bars = ax.barh(positions, values, color=PRIMARY, height=0.64)
        ax.set_yticks(positions, labels=labels)
        ax.invert_yaxis()
        limit = max(max(values), 1)
        ax.set_xlim(0, limit * 1.18)
        for bar, value in zip(bars, values):
            ax.text(
                bar.get_width() + limit * 0.02,
                bar.get_y() + bar.get_height() / 2,
                f"{value:g}",
                va="center",
                ha="left",
                fontsize=10,
                color="#0f172a",
            )
    else:
        positions = list(range(len(labels)))
        bars = ax.bar(positions, values, color=PRIMARY, width=0.62)
        ax.set_xticks(positions, labels=labels, rotation=0)
        limit = max(max(values), 1)
        ax.set_ylim(0, limit * 1.18)
        for bar, value in zip(bars, values):
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + limit * 0.02,
                f"{value:g}",
                va="bottom",
                ha="center",
                fontsize=10,
                color="#0f172a",
            )


def render_line_chart(ax, labels, values):
    positions = list(range(len(labels)))
    ax.plot(positions, values, color=PRIMARY, linewidth=2.8, marker="o", markersize=6)
    ax.fill_between(positions, values, color=ACCENT, alpha=0.15)
    ax.set_xticks(positions, labels=labels)
    limit = max(max(values), 1)
    ax.set_ylim(0, limit * 1.18)
    for x, value in zip(positions, values):
        ax.text(
            x,
            value + limit * 0.03,
            f"{value:g}",
            ha="center",
            va="bottom",
            fontsize=10,
            color="#0f172a",
        )


def main():
    title, chart_type, items = normalize_payload()
    if len(items) < 2:
        raise ValueError("at least two chart items are required")

    labels = [item["label"] for item in items]
    values = [item["value"] for item in items]

    sns.set_theme(style="whitegrid")
    figure_height = max(3.8, min(8.6, 1.6 + len(labels) * 0.48))
    fig, ax = plt.subplots(figsize=(9.4, figure_height), facecolor="#ffffff")
    configure_axes(ax, title)

    if chart_type == "line":
        render_line_chart(ax, labels, values)
    elif chart_type == "bar":
        render_bar_chart(ax, labels, values, horizontal=False)
    else:
        render_bar_chart(ax, labels, values, horizontal=True)

    fig.tight_layout()
    buffer = io.StringIO()
    fig.savefig(buffer, format="svg", bbox_inches="tight")
    plt.close(fig)
    json.dump({"svg": buffer.getvalue(), "chart_type": chart_type}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
