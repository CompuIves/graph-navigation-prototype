import { scaleLinear, scaleTime, scaleOrdinal } from "d3-scale";


const DATADOG_COLORS = ['#39c',
  '#927fb9',
  '#edbe01',
  '#81c0df',
  '#ab8fc7',
  '#ffd528'
]

export const colorMapper = scaleOrdinal(DATADOG_COLORS);
