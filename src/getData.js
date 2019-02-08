// import { mockData } from "./mockData";
import { mockData } from "./mockData/manySeries";
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
