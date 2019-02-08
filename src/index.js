import './styles.scss';

import { select } from "d3-selection";

// Doubleclicking
import { fromEvent, Subject } from 'rxjs';
import { map, buffer, debounceTime, filter } from 'rxjs/operators';

// Local Modules
import { drawMinimap } from './drawMinimap';
import { drawChart } from './drawChart';
import { getData } from './getData';

// Fixtures/constants for main chart
const container = select("#container").node();
const containerWidth = container.getBoundingClientRect().width - 210; // MAGIC NUMBER
const height = 550;
const width = containerWidth;
const margin = { top: 30, right: 20, bottom: 30, left: 30 };

const FIXTURE_DATA = getData();

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

// PART 1 - Main Chart
// Create a thing for mainChart to push events into
const mainChartSelection$ = new Subject();
// Contains xSelection, ySelection, which are the values of xScale.domain() and yScale.domain() for the top graph
const mainChartLayout = getLayout({ width, height, margin });
const mainChart = drawChart(select("#app"), FIXTURE_DATA, mainChartLayout, mainChartSelection$);

// PART 2
// Add a minimap, a tiny brushable chart for controlling another chart.
const minimapMargin = { top: 0, right: 30, bottom: 30, left: 30 };
const minimapLayout = getLayout({
  width: containerWidth,
  height: 80,
  margin: minimapMargin
});
const miniMap = drawMinimap(select("#minimap"), FIXTURE_DATA, minimapLayout, mainChart);

// PART 3:
// Asynchronous Behaviors
const X_DEFAULT_START_RATIO = 2 / 3; // How far along the x axis to start the default viewing window (0 < n <= 1)

const resetLineChart = (chart) => { // Impure: has side effect
  // Modify the scales to go back to their original extent
  // This is the state that gets passed to other things
  console.log("Chart is Resetting");

  // Reset the zoom - for now, don't do it
  // Date math
  const xDomainExtent = chart.xDomain[1] - chart.xDomain[0];
  const xMin = new Date(); // via https://stackoverflow.com/questions/1197928/how-to-add-30-minutes-to-a-javascript-date-object
  xMin.setTime(chart.xDomain[0].getTime() + (xDomainExtent * X_DEFAULT_START_RATIO)); // Don't show all data at once
  const newXDomain = [xMin, chart.xDomain[1]];

  chart.xScale.domain(newXDomain); // Reset domain to the original

  chart.yScale.domain(chart.yDomain);



  chart.drawLines(chart.lineGenerator);
  // Redraw the axes
  chart.drawAxes();
  // Report limits of the current X and Y
  chart.reportCurrentBounds();
}

const mouse$ = fromEvent(document, "click");
const buff$ = mouse$.pipe(debounceTime(250));
const doubleClick$ = mouse$.pipe(
  buffer(buff$),
  map(list => {
    return list.length;
  }),
  filter(x => x === 2)
);

// When user doubleclicks anywhere on the page, reset chart to some default pane
doubleClick$.subscribe(() => {
  resetLineChart(mainChart);
});

/* Synchronize the selection boxes */
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
// Selection is in terms of pixels
/**
 * @param: selection: { xSelection: [xMin, xMax], ySelection: [yMin, yMax] }
*/
mainChartSelection$
.subscribe({
  next: selection => {
    moveBrush(miniMap, selection);
  }
});

// onPageLoad:
/* Set the initial viewing window when the page loads */
// miniMap.twoDimensionalBrush.move(miniMap.twoDimensionalBrushGroup, [
//   // [minimapLayout.xMin, minimapLayout.yMax],     // startpoint
//   [(minimapLayout.xMin + minimapLayout.xMax) * X_DEFAULT_START_RATIO, minimapLayout.yMax], // midpoint
//   [minimapLayout.xMax, minimapLayout.yMin]                                                 // far right
// ]);
resetLineChart(mainChart);
