import './styles.scss';

import { mockData } from "./mockData";

import { scaleTime, scaleLinear, select, line, event, } from "d3";
import { format } from 'd3-format';

import { axisBottom, axisLeft } from 'd3-axis';
import { extent, max } from "d3-array";
import { brush, brushX, brushY, brushSelection } from "d3-brush";
import { zoom, zoomIdentity } from "d3-zoom";

import { zipWith } from "lodash";

// Doubleclicking
import { fromEvent, Subject } from 'rxjs';
import { map, buffer, debounceTime, filter, distinctUntilChanged } from 'rxjs/operators';

// Debugging helpers
const DEBUG = false;
const LOG = msg => DEBUG && console.log(msg);

// Fixtures/constants for main chart
const height = 550;
const width = 900;
const margin = { top: 30, right: 30, bottom: 50, left: 30 };

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
 * @param chartSelection$: a subject that reports data about what the current boundaries of the graph view are
 */
const drawChart = (node, dataset, layout, chartSelection$) => {
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

  // Axes
  const onXZoom = function() {
    xScale = event.transform.rescaleX(xScale);
    xAxisGroup.call(xAxis);
    lines.attr("d", lineGenerator);
  };

  const xZoom = zoom()  // Zoom is a little speedy, but not worth re-implementing current x-axis dragging logic
    .on("zoom", onXZoom);

  const xAxis = g => g // TODO: should this translate be hoisted somewhere
    .attr("transform", `translate(0,${layout.yMin})`)
    .call(axisBottom(xScale)
      .ticks(layout.width / 80)
      .tickSizeOuter(0))

  const xAxisGroup = svg
    .append("g")
    .attr("class", "x--axis")
    .call(xAxis)
    .call(xZoom);

  const yAxis = g => g
    .attr("transform", `translate(${layout.xMin},0)`)
    .attr('class', 'grid')
    .call(axisLeft(yScale)
          .ticks(layout.height / 70)
          .tickSize(-layout.width + layout.margin.right * 2, 0)
          .tickSizeOuter(0)
    )
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

  // Render functions to hoist into a class
  const drawLines = (pathGenerator) => { // return SVG path data as a function of data bound to each line
    lines.attr("d", pathGenerator);
  }
  const drawXAxis = () =>  xAxisGroup.call(xAxis);
  const drawYAxis = () =>  yAxisGroup.call(yAxis);
  const drawAxes = () => { // uses implicit state from yScale / xScale
    // return SVG path data as a function of data bound to each line
    drawXAxis();
    drawYAxis();
  };

  const reportCurrentBounds = () => { // side effect: notifies external subject about the new selection
    chartSelection$.next({
      xSelection: xScale.domain(),
      ySelection: yScale.domain()
    })
  }

  // INTERACTIONS
  const brushedX = function () { // non-arrow function so that "this" binds correctly
    LOG("Started x brush");
    const selection = brushSelection(this);

    // No reset for now. Beware an extra event may be firing every time.
    if (selection === null) return;

    // Careful- this mutates xScale inplace
    xScale.domain(selection.map(xScale.invert, xScale));
    // Redraw, note that lineGenerator is already pointing to xScale so there's some hidden state passed in.
    drawLines(lineGenerator);
    drawXAxis();

    // Remove brush: https://github.com/d3/d3-brush/issues/10
    xBrushGroup.call(xBrush.move, null); // Remove the brush after zooming

    event.sourceEvent.stopPropagation(); // Don't let this trigger more things

    reportCurrentBounds();
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
    // Redraw, note that lineGenerator is already pointing to xScale so there's some hidden state passed in.
    drawLines(lineGenerator);
    drawYAxis();

    yBrushGroup.call(yBrush.move, null); // Remove the brush after zooming https://github.com/d3/d3-brush/issues/10
    reportCurrentBounds();
  };

  const BRUSH_LABEL_HEIGHT = 25;
  // Based on  Custom Brush Handles: https://bl.ocks.org/mbostock/4349545
  const brushMoveY = function () {
    const selection = brushSelection(this);
    if (selection === null) {
      brushHandles.attr("display", "none");
      return;
    }

    const tickFormat = yScale.tickFormat();
    const tickFormatter = format(tickFormat);

    brushHandles
      .attr("display", null)
      .attr("transform", function (d, i) { return `translate(0,${selection[i]})`});

    // These magic numbers position the labels in an effort to center the text inside the boxes.
    brushHandleBoxes
      .attr("transform", (d) => `translate(0,${d.type === 'n' ? -BRUSH_LABEL_HEIGHT : 0})`); // BOX-HEIGHT

    const magicOffset = 4;
    brushHandleText
      .attr("transform", (d) => `translate(2,${d.type === 'n' ? -BRUSH_LABEL_HEIGHT / 2 + magicOffset : BRUSH_LABEL_HEIGHT / 2 + magicOffset})` )
      .text((d, i)=> tickFormatter(yScale.invert(selection[i])));
  }

  // Add a brush for the X-axis
  const xBrush = brushX()
    .extent([[layout.xMin, layout.yMax], [layout.xMax, layout.yMin]]) // Avoid spilling area into the y axis zone
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
    .on("end", brushedY)     // update selection at end
    .on('brush', brushMoveY); // Fire while moving

  const yBrushGroup = svg
    .append("g")
    .attr("class", "brush")
    .call(yBrush)

  // Labels
  const brushHandles = yBrushGroup
    .selectAll(".handle--custom")
    .data([{ type: "n" }, { type: "s" }])
    .enter()
    .append("g")
    .attr("class", "handle--custom")
    .attr("x", layout.margin.left / 2 - 25) // Another magic number
    .attr("display", "none");


  const brushHandleBoxes = brushHandles
    .append("rect")
    .attr('height', BRUSH_LABEL_HEIGHT)
    .attr('width', 35)
    .attr("fill", 'rgb(94,164,203)') // light blueish
    .attr("fill-opacity", 0.8);

  const brushHandleText = brushHandles
    .append("text")
    .attr('fill', 'white')
    .attr('font-size', 11);

  const xBrushGroup = svg
    .append("g")
    .attr("class", "brush")
    .call(xBrush)

  return {
    xDomain,
    yDomain,
    lineGenerator,
    xScale,
    yScale,
    xAxisGroup, // for zoom
    lines,
    // Interaction
    xZoom,
    // Redraw funcs
    drawLines,
    drawAxes,
    // observable reporters
    reportCurrentBounds,
  }
};

// Draw the main line chart
// Create a thing for mainChart to push events into
const mainChartSelection$ = new Subject();

// Contains xSelection, ySelection, which are the values of xScale.domain() and yScale.domain() for the top graph
const mainChartLayout = getLayout({ width, height, margin });
const mainChart = drawChart(select("#app"), D3_DATA, mainChartLayout, mainChartSelection$);


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

  const xAxis = g =>
    g
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

  // Add D3 Crosshairs


  return {
    xScale,
    yScale,
    twoDimensionalBrushGroup,
    twoDimensionalBrush
  }
};

const minimapMargin = { top: 0, right: 30, bottom: 30, left: 30 };
const minimapLayout = getLayout({
  width: 900,
  height: 80,
  margin: minimapMargin
});


const miniMap = drawMinimap(select("#minimap"), D3_DATA, minimapLayout, mainChart);

// On initial page load, load the second half of data
miniMap.twoDimensionalBrush.move(miniMap.twoDimensionalBrushGroup, [
  // [minimapLayout.xMin, minimapLayout.yMax],     // startpoint
  [(minimapLayout.xMin + minimapLayout.xMax) / 1.5, minimapLayout.yMax], // midpoint
  [minimapLayout.xMax, minimapLayout.yMin]                             // far right
]);

// Part 3: Asynchronous Things that involve coordinating multiple charts (RxJS Observables)
const resetLineChart = (chart) => { // Impure: has side effect
  // Modify the scales to go back to their original extent
  // This is the state that gets passed to other things
  chart.xScale.domain(chart.xDomain); // Reset domain to the originals
  chart.yScale.domain(chart.yDomain);

  // Reset the zoom
  chart.xZoom.transform(chart.xAxisGroup, zoomIdentity);

  chart.drawLines(chart.lineGenerator);
  // Redraw the axes
  chart.drawAxes();
  // Report the limits of the current X and Y
  chart.reportCurrentBounds();
}

// Add some behavior from the outside to manipulate the chart
doubleClick$.subscribe(() => {
  resetLineChart(mainChart);
});


// Given a chart, moves its twoDimensional brush to the correct location.
// Chart must expose: "twoDimensionalBrush, twoDimensionalBrushGroup, xScale, yScale"
const moveBrush = (chart, selection) => { // impure
  const { xScale, yScale } = chart;
  const topLeft = [xScale(selection.xSelection[0]), yScale(selection.ySelection[1])];
  const bottomRight = [xScale(selection.xSelection[1]), yScale(selection.ySelection[0])];

  chart.twoDimensionalBrush.move(chart.twoDimensionalBrushGroup, [
    topLeft,
    bottomRight
  ]);
}

// Make the miniMap's brush size/move if the displayed data range in the mainChart changes.
/**
 * @param: selection: { xSelection: [xMin, xMax], ySelection: [yMin, yMax] }
*/
mainChartSelection$
.pipe(distinctUntilChanged()) // No need to let people know if the values for some reason have not changed from the last selection
.subscribe({
  next: selection => {
    moveBrush(miniMap, selection)
  }
});
