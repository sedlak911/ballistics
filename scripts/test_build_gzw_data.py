"""Offline tests for build_gzw_data.py. Run: python3 -m unittest ballistics/scripts/test_build_gzw_data.py -v"""
from __future__ import annotations

import importlib.util
import pathlib
import unittest

HERE = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("build_gzw_data", HERE / "build_gzw_data.py")
b = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(b)

CHART = (HERE / "fixtures" / "ballistics_chart.wikitext").read_text()
BARREL_20 = (HERE / "fixtures" / "ar15_barrel_20.wikitext").read_text()


class ChartStats(unittest.TestCase):
    """Speed and accuracy columns of the chart: "name || 840 m/s || +6 || -100 || 8 × {{PenRating}}"."""

    def setUp(self):
        self.stats = b.parse_chart_stats(CHART)

    def test_reads_speed_and_accuracy(self):
        self.assertEqual(self.stats[b.gzw.norm("5.45x39mm BS (7N24)")], (840.0, 6.0))
        self.assertEqual(self.stats[b.gzw.norm("5.45x39mm BT (7BT4)")], (915.0, 2.0))
        self.assertEqual(self.stats[b.gzw.norm("7.62x51mm FMJ (M80A1)")], (835.0, 3.0))
        self.assertEqual(self.stats[b.gzw.norm("5.56x45mm Tracer (M856A1)")], (945.0, -4.0))

    def test_a_blank_accuracy_cell_is_unknown(self):
        self.assertEqual(self.stats[b.gzw.norm("5.56x45mm FMJ")], (880.0, None))

    def test_refuses_a_chart_whose_columns_moved(self):
        swapped = CHART.replace("|Speed<br/>m/s\n! rowspan=\"2\" |Acc Mod", "|Acc Mod\n! rowspan=\"2\" |Speed<br/>m/s", 1)
        self.assertNotEqual(swapped, CHART)
        with self.assertRaises(ValueError):
            b.parse_chart_stats(swapped)


class RoundStats(unittest.TestCase):
    """The chart's speed and accuracy win; gzw-data fills what the chart lacks."""

    def test_chart_wins_and_flags_the_flipped_sign_and_the_speed(self):
        mv, acc, notes = b.round_stats({"muzzle_velocity": "880 m/s", "accuracy_modifier": "-2 %"}, (915.0, 2.0))
        self.assertEqual((mv, acc), (915.0, 2.0))
        self.assertEqual(notes, {"sign": (-2.0, 2.0), "mv": (880.0, 915.0)})

    def test_gzw_data_fills_a_blank_chart_cell(self):
        self.assertEqual(b.round_stats({"muzzle_velocity": "880 m/s", "accuracy_modifier": "+0 %"}, (880.0, None)),
                         (880.0, 0.0, {}))

    def test_a_round_missing_from_the_chart_keeps_gzw_data(self):
        self.assertEqual(b.round_stats({"muzzle_velocity": "415 m/s", "accuracy_modifier": "+2 %"}, None), (415.0, 2.0, {}))

    def test_old_dispersion_field_is_negated(self):
        self.assertEqual(b.round_stats({"muzzle_velocity": "800 m/s", "dispersion": "-4 %"}, None), (800.0, 4.0, {}))

    def test_flags_a_different_accuracy_of_the_same_sign(self):
        _, acc, notes = b.round_stats({"muzzle_velocity": "970 m/s", "accuracy_modifier": "-7 %"}, (945.0, -4.0))
        self.assertEqual(acc, -4.0)
        self.assertEqual(notes, {"acc": (-7.0, -4.0), "mv": (970.0, 945.0)})

    def test_small_speed_drift_is_not_flagged(self):
        self.assertEqual(b.round_stats({"muzzle_velocity": "304 m/s", "accuracy_modifier": "-6 %"}, (303.0, -6.0)),
                         (303.0, -6.0, {}))


class BarrelVelocity(unittest.TestCase):
    def test_reads_velocity_from_the_infobox(self):
        self.assertEqual(b.parse_velocity_modifier(BARREL_20), 20.0)

    def test_infobox_variants(self):
        box = "{{Infobox weapon\n | type = Barrel\n | %s = %s\n}}"
        for key, value, want in (("velocity", "+20 %", 20.0), ("velocity", "-11%", -11.0),
                                 ("muzzle_velocity", "<font color=red>-4</font>", -4.0),
                                 ("muzzle velocity", "<font color=green>+12</font>", 12.0),
                                 ("muzzle_velocity", "+6.0", 6.0)):
            self.assertEqual(b.parse_velocity_modifier(box % (key, value)), want, (key, value))

    def test_unknowns(self):
        for page in ("{{Infobox weapon\n | velocity = ???\n}}", "{{Infobox weapon\n | velocity =\n | accuracy = 1.83\n}}",
                     "{{Infobox weapon\n | accuracy = 0.61\n}}", "{{Infobox weapon\n | velocity = 880 m/s\n}}", "", None):
            self.assertIsNone(b.parse_velocity_modifier(page), page)

    def test_a_blank_velocity_key_does_not_hide_muzzle_velocity(self):
        page = "{{Infobox weapon\n | accuracy = 0.48\n | velocity =\n | muzzle_velocity = +6.0\n}}"
        self.assertEqual(b.parse_velocity_modifier(page), 6.0)

    def test_gzw_data_wins_and_the_wiki_fills_gaps(self):
        self.assertEqual(b.barrel_velocity({"muzzle_velocity": "+12 %"}, "{{Infobox weapon\n | velocity = +10%\n}}"), 12.0)
        self.assertEqual(b.barrel_velocity({"muzzle_velocity": None}, BARREL_20), 20.0)
        self.assertIsNone(b.barrel_velocity({}, None))


class PenChart(unittest.TestCase):
    def setUp(self):
        self.chart = b.parse_pen_chart(CHART)

    def test_m80_is_magdump_against_iii_and_pointless_above(self):
        self.assertEqual(self.chart[b.gzw.norm("7.62x51mm FMJ (M80)")], [2, 2, 2, 2, 2, 1, 0, 0])

    def test_m61_goes_through_everything(self):
        self.assertEqual(self.chart[b.gzw.norm("7.62x51mm AP (M61)")], [2] * 8)

    def test_m855_is_magdump_only_against_iii_plus_plus(self):
        self.assertEqual(self.chart[b.gzw.norm("5.56x45mm AP (M855)")], [2, 2, 2, 2, 2, 2, 2, 1])

    def test_reads_only_the_all_tab(self):
        # Later tabs repeat rounds; every parsed row must have exactly eight ratings.
        self.assertTrue(all(len(r) == 8 for r in self.chart.values()))
        self.assertGreater(len(self.chart), 50)


class Numbers(unittest.TestCase):
    def test_parse_number(self):
        self.assertEqual(b.parse_number("1,000m"), 1000.0)
        self.assertEqual(b.parse_number("+6.0 %"), 6.0)
        self.assertEqual(b.parse_number("0.61 MOA"), 0.61)
        self.assertEqual(b.parse_number("-3 %"), -3.0)
        self.assertEqual(b.parse_number("835 m/s"), 835.0)

    def test_parse_number_unknowns(self):
        for s in ("???", None, "", "$???", "???? %"):
            self.assertIsNone(b.parse_number(s), s)


class Locations(unittest.TestCase):
    def test_variants(self):
        self.assertEqual(b.parse_locations("Front,Back,Side"), ["front", "back", "sides"])
        self.assertEqual(b.parse_locations("Front / Back"), ["front", "back"])
        self.assertEqual(b.parse_locations("Front, back"), ["front", "back"])
        self.assertEqual(b.parse_locations("Front, Back, Sides"), ["front", "back", "sides"])

    def test_unknown(self):
        self.assertEqual(b.parse_locations("???"), [])
        self.assertEqual(b.parse_locations(None), [])


class SoldBy(unittest.TestCase):
    def test_loot_only_means_no_vendor(self):
        self.assertIsNone(b.parse_sold_by("Loot only"))
        self.assertIsNone(b.parse_sold_by("???"))
        self.assertEqual(b.parse_sold_by("Gunny R.1"), "Gunny R.1")


class Magnification(unittest.TestCase):
    def test_upstream_variants(self):
        self.assertEqual(b.parse_magnification("4x"), "4×")
        self.assertEqual(b.parse_magnification("3.5x-18xx"), "3.5–18×")
        self.assertEqual(b.parse_magnification("1-6x"), "1–6×")
        self.assertEqual(b.parse_magnification("1x-10xx"), "1–10×")

    def test_unknown(self):
        self.assertIsNone(b.parse_magnification("???"))
        self.assertIsNone(b.parse_magnification(None))


class Reachable(unittest.TestCase):
    norm = staticmethod(b.gzw.norm)

    def node(self, name, **slots):
        return {self.norm(name): {"name": name, "slots": slots}}

    def test_walks_from_parts_named_after_the_weapon(self):
        nodes = {}
        nodes.update(self.node("M700", Magazine=["M700 5-Round Magazine"]))
        nodes.update(self.node("M700 MOD*X Rail", Mount=["O-ring - 30mm"]))
        nodes.update(self.node("O-ring - 30mm", Scope=["Vudu 3.5-18x50 FFP Rifle Scope"]))
        found = b.reachable_parts(nodes, "M700", ["Vudu 3.5-18x50 FFP Rifle Scope", "PSO-1 4x24"], self.norm)
        self.assertEqual(found, ["Vudu 3.5-18x50 FFP Rifle Scope"])

    def test_stops_at_max_depth(self):
        nodes = {}
        chain = ["Gun"] + [f"Part {i}" for i in range(7)] + ["Deep Scope"]
        for host, part in zip(chain, chain[1:]):
            nodes.update(self.node(host, Slot=[part]))
        self.assertEqual(b.reachable_parts(nodes, "Gun", ["Deep Scope"], self.norm), [])
        self.assertEqual(b.reachable_parts(nodes, "Gun", ["Part 5"], self.norm), ["Part 5"])

    def test_ignores_unknown_parts(self):
        nodes = self.node("Gun", Scope=["???"])
        self.assertEqual(b.reachable_parts(nodes, "Gun", ["???"], self.norm), [])


if __name__ == "__main__":
    unittest.main()
