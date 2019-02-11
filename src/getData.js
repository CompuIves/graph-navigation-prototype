// import { mockData } from "./mockData";

// To change fixture data, just keep one of these lines
// import { mockData } from "./mockData/twoSeries"; // most basic example
// import { mockData } from "./mockData/tenSeries"; // busiest chart
// import { mockData } from "./mockData/waveSeries"; // Let user drill into something with a visually interesting shape
import { mockData } from "./mockData/bumpSeries";    // Chart with some unusual inflection points worth inspecting

import { zipWith } from "lodash";

const DATA = mockData.map(series => {
  return {
    ...series,
    x: series.x.map(dateInMs => new Date(dateInMs)) // Convert times in MS into javascript date objects
  };
});

export const D3_DATA = DATA.map(series =>
  zipWith(series.x, series.y, (x, y) => ({ x, y }))
);

export const getData = () => D3_DATA;
