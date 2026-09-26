import * as echarts from 'echarts';
import sharp from 'sharp';

import { GraficoChat } from '../helpers/presentacion.helper';

const COLORES = ['#00A76F', '#1877F2', '#FFAB00', '#8E33FF', '#FF5630', '#00B8D9'];

/** Valor corto para etiquetas del gráfico: $1.2M, $850k, 1,250 */
function corto(v: number, formato?: string): string {
  const moneda = formato === 'moneda' || formato === 'precio';
  const abs = Math.abs(v);
  const txt =
    abs >= 1_000_000
      ? `${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
      : abs >= 10_000
        ? `${Math.round(v / 1000)}k`
        : new Intl.NumberFormat('en-US', { maximumFractionDigits: moneda ? 0 : 2 }).format(v);
  return moneda ? `$${txt}` : txt;
}

/**
 * Gráfico → PNG en el servidor (sin navegador): ECharts genera el SVG y sharp lo convierte a PNG a
 * doble resolución. Se usa para enviar los gráficos por Telegram como una foto normal.
 */
export async function graficoAPng(g: GraficoChat, ancho = 900, alto = 480): Promise<Buffer> {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: ancho, height: alto });
  const muchas = g.categorias.length > 12;
  chart.setOption({
    animation: false,
    backgroundColor: '#ffffff',
    color: COLORES,
    textStyle: { fontFamily: 'Helvetica, Arial, sans-serif' },
    title: { text: g.titulo, subtext: g.subtitulo ?? '', left: 16, top: 10, textStyle: { fontSize: 18 } },
    legend: g.series.length > 1 ? { top: 14, right: 16 } : undefined,
    grid: { left: 72, right: 24, top: g.subtitulo ? 76 : 60, bottom: muchas ? 70 : 44 },
    xAxis: { type: 'category', data: g.categorias, axisLabel: { rotate: muchas ? 45 : 0, fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => corto(v, g.formato) } },
    series: g.series.map((s) => ({
      name: s.nombre,
      type: g.clase === 'lineas' ? 'line' : 'bar',
      data: s.datos,
      smooth: g.clase === 'lineas',
      symbolSize: 6,
      itemStyle: g.clase === 'barras' ? { borderRadius: [5, 5, 0, 0] } : undefined,
      label: {
        show: g.categorias.length <= 12 && g.series.length === 1,
        position: 'top',
        fontSize: 11,
        formatter: (p: { value: number }) => (p.value == null ? '' : corto(p.value, g.formato)),
      },
    })),
  });
  const svg = chart.renderToSVGString();
  chart.dispose();
  return sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
}
