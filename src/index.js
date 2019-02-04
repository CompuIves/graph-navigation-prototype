import { mockData } from "./mockData";

import { scaleTime, scaleLinear, select, line, event } from "d3";
import { extent, max } from "d3-array";
import { brushX, brushSelection } from "d3-brush";
import { zipWith, debounce } from "lodash";

// Fixtures/constants
const height = 500;
const width = 600;
const margin = { top: 20, right: 30, bottom: 30, left: 40 };

const LOG = (msg) => console.log(msg);

// Dimensional Bounds
const xMin = margin.left;
const xMax = width - margin.right;
const xRange = [xMin, xMax];

const yMax = margin.top;
const yMin = height - margin.bottom;
const yRange = [yMin, yMax]; // y Axis is upside down

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
    .range(xRange);

  const yScale = scaleLinear()
    .domain(yDomain)
    .nice()
    .range(yRange);

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

  // Add some axes

  // INTERACTIONS
  const brushed = function () { // non-arrow function so that "this" will work
    console.log({event});
    console.log("Started x brush");
    const selection = brushSelection(this);

    // No reset for now. Beware an extra event may be firing every time.
    if (selection === null) return;

    // Careful- this mutates xScale inplace
    xScale.domain(selection.map(xScale.invert, xScale));
    // Redraw, note the hidden state of xScale implicitly passed in
    lines
      .attr("d", lineGenerator);

    // Remove the brush after zooming
    xBrushGroup.call(xBrush.move, null);
  };

  // Add a brush for the X-axis
  const xBrush = brushX()
    .extent([[xMin, yMax], [xMax, yMin]]) // Y is flipped because of coordinate system
    // Alternately: brush, start,
    .on("end", brushed)

  const xBrushGroup = svg
    .append("g")
    .attr("class", "brush")
    .call(xBrush)

  // Put the X axis below the previous graph so that it doesn't collide with the brush
  // Important because we want to pan with it
};

// Event Handlers
drawChart(select("#app"), D3_DATA);
