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

from server.app_env import _base
from server.app_env import local


class Config(_base.Config):
  CUSTOM = True
  NAME = "Feeding America"
  GA_ACCOUNT = 'G-444S6716SQ'


class LocalConfig(local.Config):
  CUSTOM = True
  NAME = "Feeding America"
  # This needs to talk to local mixer that is setup as a custom mixer, which
  # loads csv + tmcf files from GCS
  API_ROOT = 'https://mixer.endpoints.datcom-mixer-statvar.cloud.goog'
  API_PROJECT = 'datcom-mixer-statvar'