import { event, mouse } from 'd3-selection';
import { line } from 'd3-shape';
import { scaleLinear, scaleTime } from 'd3-scale';
import { extent, max } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { brushSelection, brushX, brushY } from "d3-brush";
import { format } from "d3-format";
import { timeFormat } from "d3-time-format";
import { zoom } from "d3-zoom";
import { flatten } from "lodash";


const DEBUG = false;
const LOG = msg => DEBUG && console.log(msg);

// STYLES
const LINE_COLOR = "#3399cc";
const BRUSH_LABEL_HEIGHT = 25;
const BRUSH_LABEL_COLOR = "rgb(94,164,203)";

/**
 * @param dataset: a list of Series, where a series is a list of Points. Point has x and y props.
 * @param node: a d3-selection of a node to attach things to.
 * @param layout: object with data relating to pixels / page layout, rather than data values
 * @param chartSelection$: a subject that reports data about what the current boundaries of the graph view are
 */
export const drawChart = (node, dataset, layout, chartSelection$) => {
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
    .attr("class", "bg");

  // Axes
  const onXZoom = function () {
    xScale = event.transform.rescaleX(xScale);
    xAxisGroup.call(xAxis);
    lines.attr("d", lineGenerator);
  };

  const xZoom = zoom()  // Zoom is a little speedy, but not worth re-implementing current x-axis dragging logic
    .on("zoom", onXZoom);

  // Via Emily: logic that will put some background color in when users interacts with the axes
  const xAxisHighlight = svg
    .append("rect")
    .attr("transform", `translate(${layout.xMin},${layout.yMin})`)
    .attr("width", layout.xMax - layout.xMin)
    .attr("height", "20px")
    .attr("class", "axis-highlight");

  const yAxisHighlight = svg
    .append("rect")
    .attr("transform", `translate(15,${layout.margin.top - 5})`)
    .attr("width", "15px")
    .attr("height", layout.yMin - layout.yMax + 10)
    .attr("class", "y-axis-highlight");

  const xAxis = g => g // TODO: should this translate be hoisted somewhere
    .attr("transform", `translate(0,${layout.yMin})`)
    .call(axisBottom(xScale)
      .ticks(layout.width / 80)
      .tickSizeOuter(0))
    .on("mouseover", () => {
      xAxisHighlight.classed("highlight-hover", true);
    }).on("mouseout", () => {
      xAxisHighlight.classed("highlight-hover", false)
    });

  const xAxisGroup = svg
    .append("g")
    .attr("class", "x--axis")
    .call(xAxis)
    .call(xZoom);

  const yAxis = g => g
    .attr("transform", `translate(${layout.xMin},0)`)
    .call(axisLeft(yScale)
      .ticks(layout.height / 70)
      .tickSize(-layout.width + layout.margin.right * 2, 0)
      .tickSizeOuter(0)
    )
    .call(g => g.select(".domain").remove());

  const yAxisGroup = svg
    .append("g")
    .attr("class", "y--axis grid")
    .call(yAxis);

  // Drawing function- returns a "d" for an svg path
  const lineGenerator = line()
    .defined(d => !isNaN(d.y))
    .x(d => xScale(d.x))
    .y(d => yScale(d.y));

  // Draw line for each series
  const lineContainer = svg
    .append("g")
    .attr("fill", "none")
    .attr("stroke", LINE_COLOR)
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
  const drawXAxis = () => xAxisGroup.call(xAxis);
  const drawYAxis = () => yAxisGroup.call(yAxis);
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

  const brushedY = function () {
    // non-arrow function so that "this" binds correctly
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


  // Based on  Custom Brush Handles: https://bl.ocks.org/mbostock/4349545
  const brushMoveY = function () {
    const selection = brushSelection(this);
    if (selection === null) {
      brushHandles.attr("display", "none");
      return;
    }
    // Turn off the highlighter box while brush is happening
    yAxisHighlight.classed("highlight-hover", false);

    const tickFormat = yScale.tickFormat();
    const tickFormatter = format(tickFormat);

    brushHandles
      .attr("display", null)
      .attr("transform", function (d, i) { return `translate(0,${selection[i]})` });

    // These magic numbers position the labels in an effort to center the text inside the boxes.
    brushHandleBoxes
      .attr("transform", (d) => `translate(0,${d.type === 'n' ? -BRUSH_LABEL_HEIGHT : 0})`); // BOX-HEIGHT

    const magicOffset = 4;
    brushHandleText
      .attr("transform", (d) => `translate(2,${d.type === 'n' ? -BRUSH_LABEL_HEIGHT / 2 + magicOffset : BRUSH_LABEL_HEIGHT / 2 + magicOffset})`)
      .text((d, i) => tickFormatter(yScale.invert(selection[i])));
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
    .attr("class", "y-brush")
    .call(yBrush);

  yBrushGroup.on("mouseover", () => {
      // propagate highlight event down since axis blocks the rectangle
      yAxisHighlight.classed("highlight-hover", true);
    })
    .on("mouseout", () => {
      yAxisHighlight.classed("highlight-hover", false);
    });

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
    .attr("fill", BRUSH_LABEL_COLOR) // light blueish
    .attr("fill-opacity", 0.8);

  const brushHandleText = brushHandles
    .append("text")
    .attr('fill', 'white')
    .attr('font-size', 11);

  const xBrushGroup = svg
    .append("g")
    .attr("class", "x-brush")
    .call(xBrush)

  // Add lines to indicate where your cursor is currently pointing
  const CROSSHAIR_COLOR = 'lightgrey'
  const verticalLine = svg
    .append("line")
    .attr("opacity", 0)
    .attr("y1", layout.yMin)
    .attr("y2", layout.yMax)
    .attr("stroke", CROSSHAIR_COLOR)
    .attr("stroke-width", 1)
    .attr("pointer-events", "none");
  const horizontalLine = svg.append("line")
    .attr("opacity", 0)
    .attr("x1", layout.xMin)
    .attr("x2", layout.xMax)
    .attr("stroke", CROSSHAIR_COLOR)
    .attr("stroke-width", 1)
    .attr("pointer-events", "none");

  const verticalCrosshairLabel = svg
    .append("text")
    .attr("font-size", 11)
    .attr("opacity", 0);

  const horizontalCrosshairLabel = svg
    .append("text")
    .attr('font-size', 11)
    .attr("opacity", 0);


  const xFormatter = timeFormat("%H:%M:%S");
  const drawCrosshairs = function () {
    const [mouseX, mouseY] = mouse(this);

    verticalLine
      .attr("transform", `translate(${mouseX}, 0)`)
      .attr("opacity", 1);
    horizontalLine
      .attr('transform', `translate(0, ${mouseY})`)
      .attr('opacity', 1);

    verticalCrosshairLabel
      .attr('transform', `translate(${mouseX}, ${layout.yMax})`)
      .attr('opacity', 1)
      .text(xFormatter(xScale.invert(mouseX)));

    const yFormatter = format(".2f"); // default to something with decimals

    horizontalCrosshairLabel
      .attr("transform", `translate(${layout.xMin}, ${mouseY})`)
      .attr("opacity", 1)
      .text(yFormatter(yScale.invert(mouseY)));
    ;
  }

  const hideCrosshairs = function () {
    verticalLine.attr("opacity", 0);
    horizontalLine.attr("opacity", 0);
    verticalCrosshairLabel.attr('opacity', 0);
    horizontalCrosshairLabel.attr('opacity', 0);
  }

  xBrushGroup
    .on('mousemove', drawCrosshairs)
    .on('mouseout', hideCrosshairs);

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
