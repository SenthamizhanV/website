/**
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Creates and manages choropleth rendering.
 */

import React, { Component } from "react";
import axios from "axios";
import * as d3 from "d3";

class ChoroplethMap extends Component {
  constructor() {
    super({});
    // Add default state and bind function contexts.
    const urlParams = new URLSearchParams(window.location.search);
    this.state = {
      geojson: [],
      pc:
        // TODO(iancostello): Potentially make pc simply a flag toggle without
        // a value.
        urlParams.has("pc") &&
        ["t", "true", "1"].includes(urlParams.get("pc").toLowerCase()),
      values: {},
    };
    this.loadGeoJson = this.loadGeoJson.bind(this);
    this.renderGeoMap = this.renderGeoMap.bind(this);
    this.loadValues = this.loadValues.bind(this);
    this.handleMapHover = this.handleMapHover.bind(this);
    this.updateGeoValues = this.updateGeoValues.bind(this);
    this.loadGeoJson();
  }

  /** 
   * Refreshes are currently never done through state updates.
   * TODO(iancostello): Refactor this component to update via state.
   */
  shouldComponentUpdate(): boolean {
    return false;
  }

  /**
   * Loads and renders blank GeoJson map for current geoDcid.
   * After loading, values for a particular StatVar are pulled.
   */
  loadGeoJson(): void {
    let geoUrl = "/api/choropleth/geo";
    geoUrl += buildChoroplethParams(["pc", "geoDcid", "level", "mdom"]);
    let valueUrl = "/api/choropleth/values";
    valueUrl += buildChoroplethParams(["geoDcid", "statVar"]);

    // Create request and generate map.
    const geoPromise = axios.get(geoUrl);
    const valuePromise = axios.get(valueUrl);

    Promise.all([geoPromise, valuePromise]).then((values) => {
      this.setState({ geojson: values[0].data[0], values: values[1].data[0] });
      //TODO(iancostello): Investigate if this can be moved to
      //shouldComponentUpdate.
      this.renderGeoMap();
      this.updateGeoValues();
    });
  }

  /**
   * Loads values for the current geoDcid and updates map.
   */
  loadValues(): void {
    let baseUrl = "/api/choropleth/values";
    baseUrl += buildChoroplethParams(["geoDcid", "level", "statVar"]);

    axios.get(baseUrl).then((resp) => {
      this.setState({ values: resp.data[0] });
      this.updateGeoValues();
    });
  }

  /**
   * Set Per Capita.
   */
  setPerCapita(pc: boolean): void {
    this.setState({ pc });
    this.renderGeoMap();
  }

  /**
   * Handles rendering the basic blank geoJson map.
   * Requires state geojson to be set with valid geoJson mapping object.
   */
  renderGeoMap(): void {
    // Combine path elements from D3 content.
    const geojson = this.state["geojson"];
    const mapContent = d3
      .select("#main-pane g.map")
      .selectAll("path")
      .data(geojson.features);

    // Scale and center the map.
    const svgContainer = document.getElementById("map_container");
    const projection = d3
      .geoAlbersUsa()
      .fitSize([svgContainer.clientWidth, svgContainer.clientHeight], geojson);
    const geomap = d3.geoPath().projection(projection);

    // Build map objects.
    mapContent
      .enter()
      .append("path")
      .attr("d", geomap)
      // Add CSS class to each path for border outlining.
      .attr("class", "border")
      .attr("fill", "gray")
      // Add various event handlers.
      .on("mouseover", this.handleMapHover)
      .on("mouseleave", this.mouseLeave)
      .on("click", this.handleMapClick);

    this.setState({ mapContent });

    // Create population map.
    const popMap = {};
    for (const index in geojson.features) {
      const content = geojson.features[index];
      popMap[content.id] = content.properties.pop;
    }
    this.setState(() => {
      return { popMap };
    });
  }

  /**
   * Updates geoJson map with current values loaded in state.
   * Requires geoJson map to be rendered and state values to be set.
   */
  updateGeoValues(): void {
    const values = this.state["values"];
    const isPerCapita = this.state["pc"];

    // Build chart display options.
    const colorScale = d3
      .scaleLinear()
      .domain(
        determineColorPalette(values, this.state["pc"], this.state["popMap"])
      )
      // TODO(iancostello): Investigate if this can be tighter type.
      .range(["#deebf7", "#9ecae1", "#3182bd"] as any);

    // Select D3 paths via geojson data.
    const geojson = this.state["geojson"];
    const mapContent = d3
      .select("#main-pane g.map")
      .selectAll("path")
      .data(geojson.features);

    // Create new infill.
    mapContent.attr("fill", function (d: {
      properties: { geoDcid: string; pop: number };
    }) {
      if (d.properties.geoDcid in values) {
        const value = values[d.properties.geoDcid];
        if (isPerCapita) {
          if (Object.prototype.hasOwnProperty.call(d.properties, "pop")) {
            return colorScale(value / d.properties.pop);
          }
          return "gray";
        }
        return colorScale(value);
      } else {
        return "gray";
      }
    });

    // Update title.
    // TODO(iancostello): Use react component instead of innerHTML throughout.
    const url = new URL(window.location.href);
    document.getElementById("heading").innerHTML =
      url.searchParams.get("statVar") +
      " in " +
      this.state["geojson"]["properties"]["current_geo"];
  }

  /**
   * Updates the current map and URL to a new statistical variable without
   * a full page refresh.
   * @param statVar to update to.
   */
  handleStatVarChange(statVar: string): void {
    // Update URL history.
    let baseUrl = "/tools/choropleth";
    baseUrl += buildChoroplethParams(["geoDcid", "bc", "pc", "level", "mdom"]);
    baseUrl += "&statVar=" + statVar;
    // TODO(iancostello): Move into helper.
    history.pushState({}, null, baseUrl);

    // TODO(iancostello): Manage through component's state.
    this.loadValues();
  }

  /**
   * Capture hover event on geo and displays relevant information.
   * @param {json} geo is the geoJson content for the hovered geo.
   */
  handleMapHover(geo: {
    ref: string;
    properties: { name: string; geoDcid: string; pop: number };
  }): void {
    // Display statistical variable information on hover.
    const name = geo.properties.name;
    const geoDcid = geo.properties.geoDcid;
    const values = this.state["values"];
    let geoValue: any = "No Value";
    if (geoDcid in values) {
      geoValue = values[geoDcid];
      if (this.state["pc"]) {
        if (Object.prototype.hasOwnProperty.call(geo.properties, "pop")) {
          geoValue /= geo.properties.pop;
        }
      }
    }

    document.getElementById("hover-text-display").innerHTML =
      name + " - " + formatGeoValue(geoValue, this.state["pc"]);

    // Highlight selected geo in black on hover.
    d3.select(geo.ref).attr("class", "border-highlighted");
  }

  /**
   * Clears output after leaving a geo.
   */
  mouseLeave(geo: { ref: string }): void {
    // Remove hover text.
    document.getElementById("hover-text-display").innerHTML = "";

    // Remove geo display effect.
    d3.select(geo.ref).attr("class", "border");
  }

  /**
   * Capture click event on geo and zooms
   * user into that geo in the choropleth tool.
   * @param {json} geo is the geoJson content for the clicked geo.
   */
  handleMapClick(geo: {
    properties: { geoDcid: string; hasSublevel: boolean };
  }): void {
    if (geo.properties.hasSublevel) {
      redirectToGeo(geo.properties.geoDcid);
    } else {
      //TODO(iancostello): Improve this feature (change cursor).
      alert("This geo has no further sublevels!");
    }
  }

  render(): JSX.Element {
    // TODO(iancostello): capture size from parent.
    return (
      <React.Fragment>
        <svg id="map_container" width="800px" height="500px">
          <g className="map"></g>
        </svg>
      </React.Fragment>
    );
  }
}

/**
 * Builds a redirect link given the fields to include from search params.
 * @param fieldsToInclude
 */
function buildChoroplethParams(fieldsToInclude: string[]): string {
  let params = "?";
  const url = new URL(window.location.href);
  for (const index in fieldsToInclude) {
    const arg_name = fieldsToInclude[index];
    const arg_value = url.searchParams.get(arg_name);
    if (arg_value != null) {
      params += "&" + arg_name + "=" + arg_value;
    }
  }
  return params;
}

/**
 * Redirects the webclient to a particular geo. Handles breadcrumbs in redirect.
 * @param {string} geoDcid to redirect to.
 */
function redirectToGeo(geoDcid: string): void {
  const url = new URL(window.location.href);

  let baseUrl = "/tools/choropleth";
  baseUrl += buildChoroplethParams(["statVar", "pc", "level", "mdom"]);
  baseUrl += "&geoDcid=" + geoDcid;
  baseUrl += "&bc=";

  // Add or create breadcrumbs field.
  // TODO(iancostello): Use parent places api.
  const breadcrumbs = url.searchParams.get("bc");
  if (breadcrumbs != null && breadcrumbs !== "") {
    baseUrl += breadcrumbs + ";";
  }
  baseUrl += url.searchParams.get("geoDcid");
  window.location.href = baseUrl;
}

/**
 * Generates the breadcrumbs text from browser url.
 */
function generateBreadCrumbs(): void {
  const url = new URL(window.location.href);

  const breadcrumbs = url.searchParams.get("bc");
  if (breadcrumbs != null && breadcrumbs !== "") {
    const breadcrumbsDisplay = document.getElementById("breadcrumbs");
    const crumbs = breadcrumbs.split(";");

    // Build url for each reference in the breadcrumbs.
    let baseUrl = "/tools/choropleth";
    baseUrl += buildChoroplethParams(["statVar", "pc", "level", "mdom"]);
    baseUrl += "&geoDcid=";

    let breadcrumbsUpto = "";
    for (const index in crumbs) {
      const levelRef = crumbs[index];

      if (levelRef !== "") {
        // TODO(iancostello): Turn into react component to sanitize.
        const currUrl = baseUrl + levelRef + "&bc=" + breadcrumbsUpto;
        breadcrumbsDisplay.innerHTML +=
          '<a href="' + currUrl + '">' + levelRef + "</a>" + " > ";
        breadcrumbsUpto += levelRef + ";";
      }
    }
    breadcrumbsDisplay.innerHTML += url.searchParams.get("geoDcid");
  }
}

/**
 * Returns domain of color palette as len 3 numerical array for plotting.
 * @param dict of values mapping geoDcid to number returned by /values endpoint.
 * @param pc boolean if plotting pc.
 * @param popMap json object mapping geoDcid to total population.
 */
function determineColorPalette(dict, pc: boolean, popMap: []): number[] {
  // Create a sorted list of values.
  const values = [];
  for (const key in dict) {
    if (pc) {
      if (Object.prototype.hasOwnProperty.call(popMap, key)) {
        values.push(dict[key] / popMap[key]);
      }
    } else {
      values.push(dict[key]);
    }
  }
  values.sort(function (a, b) {
    return a - b;
  });
  const len = values.length;
  const lowerValue = values[0];
  const medianValue = values[len / 2];
  const upperValue = values[len - 1];
  return [lowerValue, medianValue, upperValue];
}

/**
 * Returns a nicely formatted hover value for the value of statistical variables
 * for geographies.
 * @param geoValue statistical variable value to display.
 * @param isPerCapita whether the value is a per capita indicator.
 */
function formatGeoValue(geoValue, isPerCapita) {
  // Per capita values may be difficult to read so add a per count field.
  // E.g. 0.0052 or 5.2 per 1000.
  if (!isPerCapita || geoValue === "No Value") {
    return geoValue.toLocaleString();
  } else {
    // Find a multiplier such that the value is greater than 1.
    if (geoValue < 1) {
      let multiplier = 1;
      let dispValue = geoValue;
      while (dispValue && dispValue < 1) {
        dispValue *= 10;
        multiplier *= 10;
      }
      return (
        `${geoValue.toFixed(6)} or ${dispValue.toLocaleString()} per ${multiplier.toLocaleString()} people`
      );
    } else {
      return geoValue.toLocaleString() + " per capita";
    }
  } 
}

export { ChoroplethMap, generateBreadCrumbs };