import './styles.css';

import { mockData } from "./mockData";

import { scaleTime, scaleLinear, select, line, event } from "d3";

import { axisBottom, axisLeft } from 'd3-axis';
import { extent, max } from "d3-array";
import { brush, brushX, brushY, brushSelection } from "d3-brush";
import { zoom } from "d3-zoom";

import { zipWith } from "lodash";

// Doubleclicking
import { fromEvent, } from 'rxjs';
import { map, buffer, debounceTime, filter } from 'rxjs/operators';

// Fixtures/constants for main chart
const height = 550;
const width = 900;
const margin = { top: 30, right: 30, bottom: 50, left: 30 };

const DEBUG = false;

const LOG = (msg) => DEBUG && console.log(msg);

// Dimensional Bounds
const getLayout = ({width, height, margin}) => {
  const xMin = margin.left;
  const xMax = width - margin.right;
  const yMax = margin.top;
  const yMin = height - margin.bottom;

  return {
      height,
      width,
      margin,
      // Bounds
      xMin,
      xMax,
      yMin,
      yMax,
  }
}

const LAYOUT = getLayout({width, height, margin});


const DATA = mockData.map(series => {
  return {
    ...series,
    x: series.x.map(dateInMs => new Date(dateInMs)) // Convert times in MS into javascript date objects
  };
});

const D3_DATA = DATA.map(series =>
  zipWith(series.x, series.y, (x, y) => ({ x, y }))
);

// Document level listeners, to reset the view
// DoubleClick
const mouse$ = fromEvent(document, "click");
const buff$ = mouse$.pipe(debounceTime(250));
const doubleClick$ = mouse$.pipe(
  buffer(buff$),
  map(list => {
    return list.length;
  }),
  filter(x => x === 2)
);

/**
 * @param dataset: a list of Series, where a series is a list of Points. Point has x and y props.
 * @param node: a d3-selection of a node to attach things to.
 * @param layout: object with data relating to pixels / page layout, rather than data values
 */
const drawChart = (node, dataset, layout) => {
  // TODO: make this true across all series, not just the first
  // Flat array across all series
  const data = dataset[0];
  const xDomain = extent(data, d => d.x);
  const yDomain = [0, max(data, d => d.y)];

  // Scaling functions
  let xScale = scaleTime()
    .domain(xDomain)
    .range([layout.xMin, layout.xMax]);

  const yScale = scaleLinear()
    .domain(yDomain)
    .nice()
    .range([layout.yMin, layout.yMax]);

  // Mutate the DOM
  const svg = node
    .append("svg")
    .attr("height", layout.height)
    .attr("width", layout.width)
    .attr("class", "bg");
    ;

  // Axes
  const onXZoom = function() {
    xScale = event.transform.rescaleX(xScale);
    xAxisGroup.call(xAxis);
    lines.attr("d", lineGenerator);
  };

  const xAxis = g => g // TODO: should this translate be hoisted somewhere
    .attr("transform", `translate(0,${layout.yMin})`)
    .call(axisBottom(xScale)
      .ticks(width / 80)
      .tickSizeOuter(0))
    .call(zoom()  // Zoom is a little speedy, but not worth re-implementing current x-axis dragging logic
      .on("zoom", onXZoom));

  const xAxisGroup = svg.append('g')
    .attr('class', 'x--axis')
    .call(xAxis);

  const yAxis = g => g
    .attr("transform", `translate(${layout.xMin},0)`)
    .call(axisLeft(yScale))
    .call(g => g.select(".domain").remove())

  const yAxisGroup = svg
    .append("g")
    .attr("class", "y--axis")
    .call(yAxis);

  // DATA FUNCTION
  const lineGenerator = line()
    .defined(d => !isNaN(d.y))
    .x(d => xScale(d.x))
    .y(d => yScale(d.y));

  // Draw line for each series
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
  const brushedX = function () { // non-arrow function so that "this" binds correctly
    LOG("Started x brush");
    const selection = brushSelection(this);

    // No reset for now. Beware an extra event may be firing every time.
    if (selection === null) return;

    // Careful- this mutates xScale inplace
    xScale.domain(selection.map(xScale.invert, xScale));
    // Redraw, note the hidden state of xScale implicitly passed in
    lines
      .attr("d", lineGenerator);

    // Redraw appropriate axis
    xAxisGroup.call(xAxis);

    // Remove brush: https://github.com/d3/d3-brush/issues/10
    xBrushGroup.call(xBrush.move, null); // Remove the brush after zooming

    event.sourceEvent.stopPropagation(); // Don't let this trigger more things
  };

  const brushedY = function() {
    // non-arrow function so that "this" binds correctly
    LOG("Started y brush");
    const selection = brushSelection(this);

    // No reset for now. Beware an extra event may be firing every time.
    if (selection === null) return;

    // Careful- this mutates xScale inplace
    // Note that this needs to be upside down
    selection.reverse(); // since y axis has max/min flipped
    yScale.domain(selection.map(yScale.invert, yScale));
    // Redraw, note the hidden state of xScale implicitly passed in
    lines.attr("d", lineGenerator);

    // Redraw appropriate axis
    yAxisGroup.call(yAxis);
    yBrushGroup.call(yBrush.move, null); // Remove the brush after zooming https://github.com/d3/d3-brush/issues/10
  };

  // Add a brush for the X-axis
  const xBrush = brushX()
    .extent([[layout.xMin, layout.yMax], [layout.xMax, layout.yMin]]) // Avoid spilling area into the y axis zone
    // Alternately: brush, start,
    .on("end", brushedX)

  // Y axis clip
  // https://stackoverflow.com/questions/40193786/d3-js-redraw-chart-after-brushing
  // If this isn't included, the series will overflow the chart body on the x axis
  // Works together with a piece of CSS in index.html
  const clipPath = svg
    .append("defs")
    .append("clipPath")
    .attr("id", "clip")
    .append("rect")
    .attr("width", layout.xMax - layout.xMin)
    .attr("height", layout.yMin) // Clip the Y axis
    .attr("transform", `translate(${layout.xMin},0)`);

  // Y axis Brush
  const yBrush = brushY()
    .extent([[0, 0], [layout.xMax, layout.yMin]])
    .on("end", brushedY);

  const yBrushGroup = svg
    .append("g")
    .attr("class", "brush")
    .call(yBrush)

  // Want this to override with the y axis
  const xBrushGroup = svg
    .append("g")
    .attr("class", "brush")
    .call(xBrush)

  // Return an object with the props we might still want to manipulate...
  // Replace with class in the future
  // Or replace with "redraw lines"
  return {
    xDomain,
    yDomain,
    lineGenerator,
    xAxisGroup,
    yAxisGroup,
    xScale,
    yScale,
    xAxis,
    yAxis,
    lines
  }
};

// Draw the main line chart
const mainChart = drawChart(select("#app"), D3_DATA, LAYOUT);

// Command: has side effect
// Brings back the original "zoom"/filter level
const resetLineChart = (chart) => {
  // Modify the scales to go back to their original extent
  chart.xScale.domain(chart.xDomain); // Bind to original extent
  chart.yScale.domain(chart.yDomain);
  // Redraw the lines
  chart.lines.attr("d", chart.lineGenerator);
  // Redraw the axes
  chart.xAxisGroup.call(chart.xAxis);
  chart.yAxisGroup.call(chart.yAxis);
}

// Add some behavior from the outside to manipulate the chart
doubleClick$.subscribe(() => {
  resetLineChart(mainChart);
});

// PART 2
// Add a minimap! which is a tiny brushable chart for controlling another chart.
/**
 * @param dataset: a list of Series, where a series is a list of Points. Point has x and y props.
 * @param node: a d3-selection of a node to attach things to.
 * @param layout: object with data relating to pixels / page layout, rather than data values
 * @param targetChart: the chart to control
 */
const drawMinimap = (node, dataset, layout, targetChart) => {
  // TODO: make this true across all series, not just the first
  // Flat array across all series
  const data = dataset[0];
  const xDomain = extent(data, d => d.x);
  const yDomain = [0, max(data, d => d.y)];

  // Scaling functions
  let xScale = scaleTime()
    .domain(xDomain)
    .range([layout.xMin, layout.xMax]);

  const yScale = scaleLinear()
    .domain(yDomain)
    .nice()
    .range([layout.yMin, layout.yMax]);

  // Mutate the DOM
  const svg = node
    .append("svg")
    .attr("height", layout.height)
    .attr("width", layout.width)
    .attr("class", "bg");
  ;

  // Axes
  const onXZoom = function () {
    xScale = event.transform.rescaleX(xScale);
    xAxisGroup.call(xAxis);
    lines.attr("d", lineGenerator);
  };

  const xAxis = g => g // TODO: should this translate be hoisted somewhere
    .attr("transform", `translate(0,${layout.yMin})`)
    .call(axisBottom(xScale)
      .ticks(width / 80)
      .tickSizeOuter(0))
    .call(zoom()  // Zoom is a little speedy, but not worth re-implementing current x-axis dragging logic
      .on("zoom", onXZoom));

  // DATA FUNCTION
  const lineGenerator = line()
    .defined(d => !isNaN(d.y))
    .x(d => xScale(d.x))
    .y(d => yScale(d.y));

  // Draw line for each series
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



  // Interactions - an XY Brush
  const brushedTwoDimensional = function () {
    console.log("Minimap 2d Brush Triggered");
    const selection = brushSelection(this);
    if (selection === null) return;

    const [topLeftCorner, bottomRightCorner] = selection;
    const xSelection = [topLeftCorner[0], bottomRightCorner[0]];
    const ySelection = [topLeftCorner[1], bottomRightCorner[1]];

    console.log({xSelection, ySelection});

    // Then, we'll redraw the x dimension
    const newXDomain = xSelection.map(xScale.invert, xScale);
    targetChart.xScale.domain(newXDomain);

    console.log(newXDomain)

    ySelection.reverse();
    const newYDomain = ySelection.map(yScale.invert, yScale);
    targetChart.yScale.domain(newYDomain);

    targetChart.lines
      .attr("d", targetChart.lineGenerator);

    // Redraw appropriate axis
    targetChart.xAxisGroup.call(targetChart.xAxis);
    // targetChart.yAxisGroup.call(targetChart.yAxis);
// Remove the brush after zooming
  };
  const twoDimensionalBrush = brush()
    .extent([[layout.xMin, layout.yMax], [layout.xMax, layout.yMin]])
    .on('end', brushedTwoDimensional);



  const twoDimensionalBrushGroup = svg
    .append('g')
    .attr('class', 'twoDimensionalBrush')
    .call(twoDimensionalBrush);

  return {
    xDomain,
    yDomain,
    lineGenerator,
    xScale,
    yScale,
    lines
  }
};


const minimapMargin = { top: 0, right: 30, bottom: 0, left: 30 };

const minimapLayout = getLayout({
  width: 900,
  height: 80,
  margin: minimapMargin
});
const miniMap = drawMinimap(select("#minimap"), D3_DATA, minimapLayout, mainChart);
