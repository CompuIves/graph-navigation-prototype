import { mockData } from "./mockData";

import { scaleTime, scaleLinear, select, line } from "d3";
import { extent, max } from "d3-array";
import { brushX, brushSelection } from "d3-brush";
import { zipWith, debounce } from "lodash";

// Fixtures/constants
const height = 500;
const width = 600;
const margin = { top: 20, right: 30, bottom: 30, left: 40 };
const DATA = mockData.map(series => {
  return {
    ...series,
    x: series.x.map(dateInMs => new Date(dateInMs)) // Convert times in MS into javascript date objects
  };
});

const D3_DATA = DATA.map(series =>
  zipWith(series.x, series.y, (x, y) => ({ x, y }))
);

/**
 * @param dataset: a list of Series, where a series is a list of Points. Point has x and y props.
 * @param target: a d3-selection of a node to attach things to.
 */
const drawChart = (target, dataset) => {
  // TODO: make this true across all series, not just the first
  // Flat array across all series
  const data = dataset[0];
  const xDomain = extent(data, d => d.x);
  const yDomain = [0, max(data, d => d.y)];

  // Scaling functions
  const xScale = scaleTime()
    .domain(xDomain)
    .range([margin.left, width - margin.right]);

  const yScale = scaleLinear()
    .domain(yDomain)
    .nice()
    .range([height - margin.bottom, margin.top]);

  // DOM MANIPULATION TIME
  const svg = target
    .append("svg")
    .attr("height", height)
    .attr("width", width);

  // DATA FUNCTION
  const lineGenerator = line()
    .defined(d => !isNaN(d.y))
    .x(d => xScale(d.x))
    .y(d => yScale(d.y));

  // Draw a line for each series
  const lineContainer = svg
    .append("g")
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 1.5)
    .attr("stroke-linejoin", "round")
    .attr("stroke-linecap", "round");

  const lines = lineContainer
    .selectAll(".lineSeries") // Don't grab axis by accident
    .data(dataset)
    .enter()
    .append("path")
    .attr("class", "lineSeries")
    .attr("d", lineGenerator);

  // INTERACTIONS

  const brushed = function () { // non-arrow function to access context
    console.log("Brushing, we are");
    const selection = brushSelection(this);

    // Dangerous.. mutating state
    xScale.domain(selection.map(xScale.invert, xScale));

    // Redraw the different series..
    lines
      .attr("d", lineGenerator);

    // Change the x axis domain
    console.log(selection);
  // Let's put the X axis below the previous graph so that it doesn't
};

  const slowBrushed = debounce(brushed, 300); // wait 800 ms

  // Add an x-brush
  const xBrush = brushX()
    .extent([[0, 0], [width, height]])
    .on("brush.end", slowBrushed);

  const xBrushGroup = svg
    .append("g")
    .attr("class", "brush")
    .call(xBrush)
    // .call(xBrush.move, xScale.range())
};

// Event Handlers
drawChart(select("#app"), D3_DATA);
