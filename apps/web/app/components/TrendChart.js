'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export default function TrendChart({ bars = [], title }) {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    const labels = bars.map((item) => item.month);
    const values = bars.map((item) => Number.parseInt(item.height, 10) || 0);
    const activeIndex = bars.findIndex((item) => item.active);

    chart.setOption({
      animationDuration: 500,
      grid: {
        left: 12,
        right: 12,
        top: 18,
        bottom: 10,
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#d7dfeb' } },
        axisLabel: { color: '#6d7a8c' },
      },
      yAxis: {
        type: 'value',
        max: 100,
        splitLine: { lineStyle: { color: '#eef2f7' } },
        axisLabel: { color: '#94a3b8' },
      },
      series: [
        {
          name: title || '趋势',
          type: 'bar',
          barWidth: 34,
          data: values.map((value, index) => ({
            value,
            itemStyle: {
              borderRadius: [12, 12, 8, 8],
              color:
                index === activeIndex
                  ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                      { offset: 0, color: '#60a5fa' },
                      { offset: 1, color: '#1d4ed8' },
                    ])
                  : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                      { offset: 0, color: '#9cc2ff' },
                      { offset: 1, color: '#3b82f6' },
                    ]),
            },
          })),
        },
      ],
    });

    const resize = () => chart.resize();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [bars, title]);

  return <div ref={chartRef} className="echarts-canvas" />;
}
