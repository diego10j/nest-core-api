import { toTitleCase } from './string-util';


export function formatBarChartData(
    data: any[],
    categoryField: string,
    seriesFields: Map<string, string>
): { categories: string[]; series: { name: string; data: number[] }[] } {
    // Crear las categorías a partir del campo dado
    const categories = data.map(item => toTitleCase(item[categoryField]));

    // Crear las series dinámicamente
    const series = Array.from(seriesFields.entries()).map(([seriesName, fieldName]) => {
        return {
            name: seriesName,
            data: data.map(item => item[fieldName])
        };
    });

    return {
        categories,
        series
    };
}


export function formatPieChartData(
    data: any[],
    labelField: string,
    valueField: string
): { series: { label: string; value: number }[] } {
    // Crear las series en formato Pie chart

    const series = data.map(item => ({
        label: toTitleCase(item[labelField]),
        value: item[valueField]
    }));

    return {
        series
    };
}


export function formatRadialBarChartData(
    data: any[],
    labelField: string,
    valueField: string
): { total: number, series: { label: string; value: number }[] } {
    // Crear las series en formato Pie chart

    const series = data.map(item => ({
        label: toTitleCase(item[labelField]),
        value: item[valueField]
    }));
    const total = series.reduce((sum, item) => sum + item.value, 0);


    return {
        total,
        series
    };
}
