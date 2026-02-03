import { useMemo } from 'react'
// @ts-expect-error - no types for react-plotly.js/factory
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-expect-error - no types for plotly.js-dist-min
import Plotly from 'plotly.js-dist-min'
import type { PlotlyJSON } from '@/types/chat'

const Plot = createPlotlyComponent(Plotly)

interface PlotlyChartProps {
  json: PlotlyJSON | string
}

export function PlotlyChart({ json }: PlotlyChartProps) {
  const { data, layout } = useMemo(() => {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json
    return {
      data: parsed.data || [],
      layout: {
        ...parsed.layout,
        autosize: true,
        margin: { l: 50, r: 30, t: 40, b: 40 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit' },
      },
    }
  }, [json])

  return (
    <div className="w-full rounded-lg border bg-card overflow-hidden">
      <Plot
        data={data}
        layout={layout}
        config={{
          responsive: true,
          displayModeBar: true,
          displaylogo: false,
          modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        }}
        useResizeHandler
        className="w-full"
        style={{ width: '100%', height: '400px' }}
      />
    </div>
  )
}
