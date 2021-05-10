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

import React, { Component } from "react";
import { getPlaceNames, TimelineParams, ChartOptions } from "./util";
import {
  getStatsVarInfo,
  getStatsVar,
  StatsVarNode,
  StatsVarInfo,
} from "../statvar_menu/util";
import { SearchBar } from "./search";
import { Menu } from "../statvar_menu/menu";
import { Info } from "./info";
import { ChartRegion } from "./chart_region";
import {
  NoopStatsVarFilter,
  TimelineStatsVarFilter,
  StatsVarFilterInterface,
} from "../commons";
import _ from "lodash";

interface PageStateType {
  statsVarNodes: StatsVarNode;
  statsVarInfo: { [key: string]: StatsVarInfo };
  placeIdNames: Record<string, string>; // [(placeId, placeName)]
  statsVarTitle: Record<string, string>;
  statsVarValid: Set<string>;
  chartOptions: ChartOptions;
}

class Page extends Component<Record<string, unknown>, PageStateType> {
  params: TimelineParams;

  constructor(props: Record<string, unknown>) {
    super(props);
    this.handleHashChange = this.handleHashChange.bind(this);
    this.params = new TimelineParams();
    this.params.getParamsFromUrl();
    // set default statsVarTitle as the statsVar dcids
    const statsVarTitle = {};
    for (const statsVar of this.params.getStatsVarDcids()) {
      statsVarTitle[statsVar] = statsVar;
    }
    this.state = {
      placeIdNames: {},
      statsVarValid: new Set(),
      statsVarNodes: _.cloneDeep(this.params.statsVarNodes),
      statsVarInfo: {},
      statsVarTitle: statsVarTitle,
      chartOptions: _.cloneDeep(this.params.chartOptions),
    };
  }

  componentDidMount(): void {
    window.addEventListener("hashchange", this.handleHashChange);
    this.getAllPromises();
  }

  private handleHashChange(): void {
    if (this.params.listenHashChange) {
      // do not update if it's set by calling add/remove place/statsVar
      this.params.getParamsFromUrl();
      if (
        !_.isEqual(this.params.statsVarNodes, this.state.statsVarNodes) ||
        !_.isEqual(
          this.params.placeDcids,
          Object.keys(this.state.placeIdNames)
        ) ||
        !_.isEqual(this.params.chartOptions, this.state.chartOptions)
      ) {
        this.setState({
          statsVarNodes: _.cloneDeep(this.params.statsVarNodes),
          chartOptions: this.params.chartOptions,
        });
        this.getAllPromises();
      }
    }
    this.params.listenHashChange = true;
  }

  private getAllPromises(): void {
    let statsVarInfoPromise = Promise.resolve({});
    if (this.params.getStatsVarDcids().length !== 0) {
      statsVarInfoPromise = getStatsVarInfo(this.params.getStatsVarDcids());
    }
    let placesPromise = Promise.resolve({});
    let validStatsVarPromise = Promise.resolve(new Set<string>());
    if (this.params.placeDcids.length !== 0) {
      placesPromise = getPlaceNames(this.params.placeDcids);
      validStatsVarPromise = getStatsVar(this.params.placeDcids);
    }
    Promise.all([
      statsVarInfoPromise,
      placesPromise,
      validStatsVarPromise,
    ]).then(([statsVarInfo, placeIdNames, statsVarValid]) => {
      this.setState({
        statsVarInfo: statsVarInfo,
        placeIdNames: placeIdNames,
        statsVarValid: statsVarValid,
      });
    });
  }

  // add one statsVar with nodePath
  private addStatsVar(
    statsVar: string,
    nodePath: string[],
    denominators: string[]
  ): void {
    if (
      this.params.addStatsVar(statsVar, nodePath, denominators.splice(0, 1))
    ) {
      getStatsVarInfo(this.params.getStatsVarDcids()).then((data) => {
        this.setState({
          statsVarInfo: data,
          statsVarNodes: _.cloneDeep(this.params.statsVarNodes),
        });
      });
      this.params.setUrlStatsVars();
    }
  }

  // remove one statsVar with nodePath
  private removeStatsVar(statsVar: string, nodePath: string[] = []): void {
    if (this.params.removeStatsVar(statsVar, nodePath)) {
      const tempStatsVarInfo = this.state.statsVarInfo;
      if (!(statsVar in this.params.statsVarNodes)) {
        delete tempStatsVarInfo[statsVar];
      }
      this.setState({
        statsVarNodes: _.cloneDeep(this.params.statsVarNodes),
        statsVarInfo: tempStatsVarInfo,
      });
      this.params.setUrlStatsVars();
    }
  }

  // add one place
  private addPlace(place: string): void {
    if (this.params.addPlace(place)) {
      const placesPromise = getPlaceNames(this.params.placeDcids);
      const validStatsVarPromise = getStatsVar(this.params.placeDcids);
      Promise.all([placesPromise, validStatsVarPromise]).then((values) => {
        this.setState({
          placeIdNames: values[0],
          statsVarValid: values[1],
        });
      });
      this.params.setUrlPlaces();
    }
  }

  // remove one place
  private removePlace(place: string): void {
    if (this.params.removePLace(place)) {
      const tempPlace = this.state.placeIdNames;
      delete tempPlace[place];
      getStatsVar(this.params.placeDcids).then((data) => {
        this.setState({
          placeIdNames: tempPlace,
          statsVarValid: data,
        });
      });
      this.params.setUrlPlaces();
    }
  }

  // call back function passed down to menu for getting statsVar titles
  setStatsVarTitle(statsVarId2Title: Record<string, string>): void {
    for (const id in statsVarId2Title) {
      // remove title of unselected statsVars
      if (!Object.keys(this.state.statsVarNodes).includes(id)) {
        delete statsVarId2Title[id];
      }
    }
    for (const id in this.state.statsVarNodes) {
      if (!(id in statsVarId2Title)) {
        statsVarId2Title[id] = id;
      }
    }
    this.setState({
      statsVarTitle: statsVarId2Title,
    });
  }

  // set PerCapita for a chart
  setChartPerCapita(mprop: string, pc: boolean): void {
    if (this.params.setChartPC(mprop, pc)) {
      this.setState({
        chartOptions: _.cloneDeep(this.params.chartOptions),
      });
      this.params.setUrlChartOptions();
    }
  }

  render(): JSX.Element {
    let statsVarFilter: StatsVarFilterInterface;
    if (Object.keys(this.state.placeIdNames).length === 0) {
      statsVarFilter = new NoopStatsVarFilter();
    } else {
      statsVarFilter = new TimelineStatsVarFilter(this.state.statsVarValid);
    }
    const numPlaces = Object.keys(this.state.placeIdNames).length;
    const numStatsVarInfo = Object.keys(this.state.statsVarInfo).length;
    return (
      <div>
        <div className="explore-menu-container" id="explore">
          <div id="drill-scroll-container">
            <div className="title">Select variables:</div>
            <Menu
              selectedNodes={this.state.statsVarNodes}
              statsVarFilter={statsVarFilter}
              setStatsVarTitle={this.setStatsVarTitle.bind(this)}
              addStatsVar={this.addStatsVar.bind(this)}
              removeStatsVar={this.removeStatsVar.bind(this)}
            ></Menu>
          </div>
        </div>
        <div id="plot-container">
          <div className="container">
            {numPlaces === 0 && <h1 className="mb-4">Timelines Explorer</h1>}
            <div id="search">
              <SearchBar
                places={this.state.placeIdNames}
                addPlace={this.addPlace.bind(this)}
                removePlace={this.removePlace.bind(this)}
              />
            </div>
            {numPlaces === 0 && <Info />}
            {numPlaces !== 0 && numStatsVarInfo !== 0 && (
              <div id="chart-region">
                <ChartRegion
                  places={this.state.placeIdNames}
                  statsVars={this.state.statsVarInfo}
                  statsVarTitle={this.state.statsVarTitle}
                  removeStatsVar={this.removeStatsVar.bind(this)}
                  chartOptions={this.state.chartOptions}
                  setPC={this.setChartPerCapita.bind(this)}
                  initialPC={this.params.allPerCapita}
                  denominators={Object.entries(this.state.statsVarNodes).reduce(
                    (denominators, [dcid, node]) => {
                      denominators[dcid] = node.denominators;
                      return denominators;
                    },
                    {}
                  )}
                ></ChartRegion>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
export { Page };