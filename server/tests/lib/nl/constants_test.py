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
"""Tests for some NL constants which need validation."""

import unittest

import server.lib.nl.constants as constants


class TestNLConstants(unittest.TestCase):

  def test_place_detected_string_replacement(self):
    for k, v in constants.SHORTEN_PLACE_DETECTION_STRING.items():
      self.assertTrue(v in k)
