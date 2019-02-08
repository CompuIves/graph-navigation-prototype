import { scaleTime, scaleLinear, select, line, event, mouse } from "d3";

import { axisBottom } from "d3-axis";
import { extent, max } from "d3-array";
import { brush, brushX, brushY, brushSelection } from "d3-brush";

import { zipWith, flatten } from "lodash";

const DEBUG = false;
const LOG = msg => DEBUG && console.log(msg);


/**
 * @param dataset: a list of Series, where a series is a list of Points. Point has x and y props.
 * @param node: a d3-selection of a node to attach things to.
 * @param layout: object with data relating to pixels / page layout, rather than data values
 * @param targetChart: the chart to control
 */
export const drawMinimap = (node, dataset, layout, targetChart) => {
  // Flat array across all series
  // Flat array across all series
  const xDomain = extent(flatten(dataset), d => d.x);
  const yDomain = [0, max(flatten(dataset), d => d.y)];

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
    .attr("class", "bg minimap");
  ;
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

  const xAxis = g => g
    .call(
      axisBottom(xScale)
        .ticks(layout.width / 80)
        .tickSizeOuter(0)
    );

  const xAxisGroup = svg
    .append("g")
    .attr("class", "x--axis")
    .attr("transform", `translate(0,${layout.yMin})`)
    .call(xAxis);

  const drawXAxis = () => xAxisGroup.call(xAxis);

  // Interactions - an XY Brush
  const brushedTwoDimensional = function () {

    const selection = brushSelection(this);
    LOG("Minimap 2d Brush Triggered");
    if (selection === null) return;

    const [topLeftCorner, bottomRightCorner] = selection;
    const xSelection = [topLeftCorner[0], bottomRightCorner[0]];
    const ySelection = [topLeftCorner[1], bottomRightCorner[1]];

    // Then, we'll redraw the x dimension
    const newXDomain = xSelection.map(xScale.invert, xScale);
    targetChart.xScale.domain(newXDomain);

    ySelection.reverse(); // Y selection is backwards
    const newYDomain = ySelection.map(yScale.invert, yScale);
    targetChart.yScale.domain(newYDomain);

    targetChart.drawLines(targetChart.lineGenerator);

    // Redraw appropriate axis
    targetChart.drawAxes();
    drawXAxis(); // local labels
  };
  const twoDimensionalBrush = brush()
    .extent([[layout.xMin, layout.yMax], [layout.xMax, layout.yMin]])
    .on('end', brushedTwoDimensional);

  const twoDimensionalBrushGroup = svg
    .append('g')
    .attr('class', 'twoDimensionalBrush')
    .call(twoDimensionalBrush);

  return {
    xScale,
    yScale,
    twoDimensionalBrushGroup,
    twoDimensionalBrush
  }
};
