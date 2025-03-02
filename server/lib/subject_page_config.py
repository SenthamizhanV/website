# Copyright 2023 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from dataclasses import dataclass
from typing import Dict, List

from flask import escape

from server.config import subject_page_pb2
import server.routes.api.place as place_api
import server.services.datacommons as dc

DEFAULT_PLACE_DCID = "Earth"
DEFAULT_PLACE_TYPE = "Planet"
EUROPE_DCID = "europe"
EUROPE_CONTAINED_PLACE_TYPES = {
    "Country": "EurostatNUTS1",
    "EurostatNUTS1": "EurostatNUTS2",
    "EurostatNUTS2": "EurostatNUTS3",
    "EurostatNUTS3": "EurostatNUTS3",
}

# Tile types to filter with existence checks.
FILTER_TILE_TYPES = [
    subject_page_pb2.Tile.TileType.HIGHLIGHT,
    subject_page_pb2.Tile.TileType.RANKING,
    subject_page_pb2.Tile.TileType.HISTOGRAM,
    subject_page_pb2.Tile.TileType.MAP,
    subject_page_pb2.Tile.TileType.SCATTER,
    subject_page_pb2.Tile.TileType.BIVARIATE,
    subject_page_pb2.Tile.TileType.LINE,
    subject_page_pb2.Tile.TileType.BAR,
]


@dataclass
class PlaceMetadata:
  """Place metadata for subject pages."""
  place_name: str
  place_types: str
  parent_places: List[str]
  # If set, use this to override the contained_place_types map in config metadata.
  contained_place_types_override: Dict[str, str]


def get_all_variables(page_config):
  """Get all the variables from a page config"""
  result = []
  for category in page_config.categories:
    for _, spec in category.stat_var_spec.items():
      result.append(spec.stat_var)
      if spec.denom:
        result.append(spec.denom)
  return result


def exist_keys_category(place_dcid, category, stat_vars_existence):
  """
  Returns a dict of stat_var_spec key -> bool if data is available for the spec.
  """
  exist_keys = {}
  for stat_var_key, spec in category.stat_var_spec.items():
    stat_var = spec.stat_var
    sv_exist = stat_vars_existence['variable'][stat_var]['entity'][place_dcid]
    if spec.denom:
      denom_exist = stat_vars_existence['variable'][
          spec.denom]['entity'][place_dcid]
      exist_keys[stat_var_key] = sv_exist and denom_exist
    else:
      exist_keys[stat_var_key] = sv_exist
  return exist_keys


def remove_empty_charts(page_config, place_dcid):
  """
  Returns the page config stripped of charts with no data.
  TODO: Add checks for child places, given the tile type.
  """
  all_stat_vars = get_all_variables(page_config)
  if not all_stat_vars:
    return page_config

  stat_vars_existence = dc.observation_existence(all_stat_vars, [place_dcid])

  for category in page_config.categories:
    exist_keys = exist_keys_category(place_dcid, category, stat_vars_existence)

    for block in category.blocks:
      for column in block.columns:
        # Filter all tiles with no data
        new_tiles = []
        for t in column.tiles:
          if not t.type in FILTER_TILE_TYPES:
            new_tiles.append(t)
            continue
          filtered_keys = [k for k in t.stat_var_key if exist_keys[k]]
          if len(filtered_keys):
            del t.stat_var_key[:]
            t.stat_var_key.extend(filtered_keys)
            new_tiles.append(t)
        del column.tiles[:]
        column.tiles.extend(new_tiles)
      columns = [x for x in block.columns if len(x.tiles) > 0]
      del block.columns[:]
      block.columns.extend(columns)
    blocks = [x for x in category.blocks if len(x.columns) > 0]
    del category.blocks[:]
    category.blocks.extend(blocks)
    # Remove unused stat_var_spec from cateogry
    for key, exists in exist_keys.items():
      if not exists:
        del category.stat_var_spec[key]
  categories = [x for x in page_config.categories if len(x.blocks) > 0]
  del page_config.categories[:]
  page_config.categories.extend(categories)
  return page_config


def place_metadata(place_dcid) -> PlaceMetadata:
  """
  Returns place metadata needed to render a subject page config for a given dcid.
  """
  place_types = [DEFAULT_PLACE_TYPE]
  parent_places = []
  if place_dcid != DEFAULT_PLACE_DCID:
    place_types = dc.property_values([place_dcid], 'typeOf')[place_dcid]
    if not place_types:
      place_types = ["Place"]
    parent_places = place_api.parent_places(place_dcid).get(place_dcid, [])
  place_name = place_api.get_i18n_name([place_dcid
                                       ]).get(place_dcid, escape(place_dcid))

  # If this is a European place, update the contained_place_types in the page
  # metadata to use a custom dict instead.
  # TODO: Find a better way to handle this
  parent_dcids = map(lambda place: place.get("dcid", ""), parent_places)
  contained_place_types_override = None
  if EUROPE_DCID in parent_dcids:
    contained_place_types_override = EUROPE_CONTAINED_PLACE_TYPES

  return PlaceMetadata(place_name, place_types, parent_places,
                       contained_place_types_override)
