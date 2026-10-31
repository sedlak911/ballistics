#!/usr/bin/env python3
"""Build src/games/gzw/data/gzw-data.json from gzw-data.dev and the GZW Fandom wiki.

Reuses the GZW skill's gzw.py (snapshot loading, wiki fetching, mod graph) and its cache in ~/.cache/gzw-skill.
Run from ballistics/: python3 scripts/build_gzw_data.py
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "src" / "games" / "gzw" / "data" / "gzw-data.json"
GZW_PY = HERE.parent.parent / "gzw-skill" / "gray-zone-warfare" / "scripts" / "gzw.py"

_spec = importlib.util.spec_from_file_location("gzw", GZW_PY)
gzw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gzw)

NIJ_CLASSES = ["I", "IIA", "IIA+", "IIIA", "IIIA+", "III", "III+", "III++"]
MAX_DEPTH = 6


def parse_number(s: str | None) -> float | None:
    """First number in a display string ("1,000m", "+6.0 %", "0.61 MOA"); None when unknown."""
    m = re.search(r"[-+]?\d[\d,]*\.?\d*", s or "")
    return float(m.group(0).replace(",", "")) if m else None


class ChartRow(NamedTuple):
    name: str  # norm(ammo name)
    ratings: list[int]  # eight {{PenRating|n}} values, I … III++
    speed: float | None  # m/s
    accuracy: float | None  # accuracy modifier in %, positive = tighter group; a blank cell is None


def _chart_rows(wikitext: str):
    """A ChartRow for each row of the chart's "All=" tab: "name || 840 m/s || +6 || -100 || 8 × {{PenRating}}"."""
    body = wikitext.split("<tabber>", 1)[1].split("|-|", 1)[0]
    heads = [h.rsplit("|", 1)[-1].strip().lower() for h in re.findall(r"^!(.*)$", body, re.M)]
    speed_col = next((i for i, h in enumerate(heads) if h.startswith("speed")), None)
    if speed_col is None or speed_col + 1 >= len(heads) or not heads[speed_col + 1].startswith("acc"):
        raise ValueError(f"Ballistics chart: expected Speed then Acc Mod after the name, got {heads[:6]}")
    for row in body.split("\n|-"):
        ratings = [int(n) for n in re.findall(r"\{\{PenRating\|(\d)\}\}", row)]
        links = re.findall(r"\[\[([^\]]+)\]\]", row)
        if len(ratings) != 8 or not links:
            continue
        target, _, display = links[-1].partition("|")
        cells = row.split("||")
        at = max(i for i, c in enumerate(cells) if "[[" in c)  # the name; a caliber link may precede it
        speed = cells[at + 1] if "m/s" in cells[at + 1] else None
        yield ChartRow(gzw.norm((display or target).replace("_", " ")), ratings, parse_number(speed),
                       parse_number(cells[at + 2]))


def parse_pen_chart(wikitext: str) -> dict[str, list[int]]:
    """norm(ammo name) → eight {{PenRating|n}} values (I … III++) from the chart's "All=" tab."""
    return {r.name: r.ratings for r in _chart_rows(wikitext)}


def parse_chart_stats(wikitext: str) -> dict[str, tuple[float | None, float | None]]:
    """norm(ammo name) → (speed in m/s, accuracy modifier in %) from the chart's "All=" tab."""
    return {r.name: (r.speed, r.accuracy) for r in _chart_rows(wikitext)}


def round_stats(record: dict, chart: tuple[float | None, float | None] | None):
    """(muzzle velocity, accuracy modifier, notes) for a gzw-data ammo record.

    The wiki chart's speed and accuracy win when it has them: the ammo pages' accuracy came from an older
    "dispersion" field without its sign flipped, and some speeds are stale. gzw-data fills the rest. `notes`
    names what the chart overrode: "sign" (opposite signs), "acc" (another value), "mv" (more than 5 m/s apart),
    each as (gzw-data, chart)."""
    data_mv = parse_number(record.get("muzzle_velocity"))
    data_acc = parse_number(record.get("accuracy_modifier"))
    if data_acc is None and parse_number(record.get("dispersion")) is not None:
        data_acc = -parse_number(record.get("dispersion"))  # dispersion −4 % is a 4 % tighter group
    chart_mv, chart_acc = chart or (None, None)
    notes = {}
    if data_acc is not None and chart_acc is not None and data_acc != chart_acc:
        notes["sign" if data_acc * chart_acc < 0 else "acc"] = (data_acc, chart_acc)
    if data_mv is not None and chart_mv is not None and abs(data_mv - chart_mv) > 5:
        notes["mv"] = (data_mv, chart_mv)
    return (chart_mv if chart_mv is not None else data_mv,
            chart_acc if chart_acc is not None else data_acc, notes)


def parse_velocity_modifier(wikitext: str | None) -> float | None:
    """A barrel's muzzle-velocity modifier in % from its wiki infobox ("velocity = +20%",
    "muzzle_velocity = <font color=red>-4</font>"); None when unknown or not a percentage."""
    box = gzw.parse_infobox(wikitext or "")
    for key in ("muzzle_velocity", "velocity", "muzzle velocity"):
        value = re.sub(r"<[^>]*>", "", box.get(key) or "")
        if "m/s" not in value and (n := parse_number(value)) is not None:
            return n
    return None


def barrel_velocity(record: dict, wikitext: str | None) -> float | None:
    """gzw-data's muzzle-velocity modifier, else the wiki infobox's (the snapshot drops a `velocity` field)."""
    own = parse_number(record.get("muzzle_velocity"))
    return own if own is not None else parse_velocity_modifier(wikitext)


def parse_locations(s: str | None) -> list[str]:
    """Plate locations in a fixed order; "Side" and "Sides" both mean sides."""
    words = {w.strip().lower() for w in re.split(r"[,/]", s or "")}
    found = []
    for key, aliases in (("front", {"front"}), ("back", {"back"}), ("sides", {"side", "sides"})):
        if words & aliases:
            found.append(key)
    return found


def parse_sold_by(s: str | None) -> str | None:
    """Vendor and rank, or None when the item is loot only (the UI translates that)."""
    s = _str(s)
    return None if s is None or s.lower() == "loot only" else s


def parse_magnification(s: str | None) -> str | None:
    """"3.5x-18xx" (the API doubles the x on ranges) → "3.5–18×"; "4x" → "4×"."""
    steps = re.findall(r"\d+(?:\.\d+)?", s or "")
    return "–".join(steps) + "×" if steps else None


def reachable_parts(nodes: dict, weapon: str, wanted: list[str], norm, max_depth: int = MAX_DEPTH,
                    skip_starts: set[str] = frozenset()) -> list[str]:
    """Parts from `wanted` reachable from the weapon through the mod graph's forward slots.

    The walk also starts from every node whose name begins with the weapon's name (e.g. "M700 MOD*X Rail"),
    because the wiki doesn't link some weapons to their own rails. `skip_starts` excludes other weapons
    that share the prefix ("Mosin-Nagant (Sniper)" for "Mosin-Nagant")."""
    wanted_by_key = {norm(w): w for w in wanted}
    wk = norm(weapon)
    frontier = [wk] + [k for k in nodes if k.startswith(wk) and k != wk and k not in skip_starts]
    seen = set(frontier)
    found = {wanted_by_key[k] for k in frontier if k in wanted_by_key}
    for _ in range(max_depth):
        nxt = []
        for key in frontier:
            for parts in nodes.get(key, {}).get("slots", {}).values():
                for part in parts:
                    pk = norm(part)
                    if part == "???" or pk in seen:
                        continue
                    seen.add(pk)
                    if pk in wanted_by_key:
                        found.add(wanted_by_key[pk])
                    nxt.append(pk)
        frontier = nxt
    return sorted(found)


def _str(v) -> str | None:
    v = (v or "").strip() if isinstance(v, str) else v
    return None if v in (None, "", "???") else v


def _nij(v: str | None) -> str | None:
    v = _str(v)
    return v if v in NIJ_CLASSES else None


def build(out_path: Path = OUT) -> dict:
    norm = gzw.norm
    weapons_raw = gzw.load("weapons")
    ammo_raw = gzw.load("ammo")
    barrels_raw = gzw.load("barrels")
    scopes_raw = gzw.load("scopes")
    chart_text = gzw.wiki_page("Ballistics")["content"]
    chart = parse_pen_chart(chart_text)
    chart_stats = parse_chart_stats(chart_text)
    barrel_pages = gzw.wiki_pages([r["name"] for r in barrels_raw])
    nodes = gzw.mod_graph()["nodes"]
    weapon_keys = {norm(w["name"]) for w in weapons_raw}

    ammo_names = [a["name"] for a in ammo_raw]
    accepted = {w["name"]: gzw.split_ammo(w.get("accepted_ammunition"), ammo_names) for w in weapons_raw}
    caliber_of = {}
    for w in weapons_raw:
        for name in accepted[w["name"]]:
            caliber_of.setdefault(name, _str(w.get("caliber")))

    ammo, overridden = [], []
    for a in ammo_raw:
        rating = chart.get(norm(a["name"]))
        mv, acc, notes = round_stats(a, chart_stats.get(norm(a["name"])))
        stopped = _str(a.get("stopped_by_armor_class"))
        if mv is None and stopped is None and rating is None:
            continue  # caliber overview pages ("5.56x45mm NATO") carry no stats
        if notes:
            overridden.append((a["name"], notes))
        ammo.append({
            "id": a["id"], "name": a["name"],
            "caliber": caliber_of.get(a["name"]) or a["name"].split(" ")[0],
            "muzzleVelocityMs": mv, "accuracyModifierPct": acc,
            "stoppedBy": stopped, "chart": rating, "soldBy": parse_sold_by(a.get("sold_by")),
        })
    ammo_id = {a["name"]: a["id"] for a in ammo}

    barrels = [{
        "id": r["id"], "name": r["name"],
        "accuracyMoa": parse_number(r.get("accuracy")),
        "velocityModifierPct": barrel_velocity(r, (barrel_pages.get(r["name"]) or {}).get("content")),
        "soldBy": parse_sold_by(r.get("sold_by")),
    } for r in barrels_raw]
    scopes = [{
        "id": r["id"], "name": r["name"], "magnification": parse_magnification(r.get("magnification")),
        "maxZeroM": parse_number(r.get("sighting_range")), "ffp": "FFP" in r["name"],
        "soldBy": parse_sold_by(r.get("sold_by")),
    } for r in scopes_raw]
    barrel_names = [r["name"] for r in barrels_raw]
    scope_names = [r["name"] for r in scopes_raw]

    weapons = []
    for w in weapons_raw:
        wk = norm(w["name"])
        others = weapon_keys - {wk}
        own_barrels = set(reachable_parts(nodes, w["name"], barrel_names, norm, skip_starts=others))
        own_barrels |= {b for b in barrel_names if norm(b).startswith(wk)}
        own_barrels |= {nodes[norm(b)]["name"] for b in barrel_names if norm(b) in nodes
                        and any(norm(h) == wk for h in nodes[norm(b)]["slots"].get("Upper Receiver", []))}
        weapons.append({
            "id": w["id"], "name": w["name"], "type": _str(w.get("type")), "caliber": _str(w.get("caliber")),
            "ammoIds": [ammo_id[n] for n in accepted[w["name"]] if n in ammo_id],
            "accuracyMoa": parse_number(w.get("accuracy")),
            "barrelIds": sorted(r["id"] for r in barrels if r["name"] in own_barrels),
            "scopeIds": sorted(r["id"] for r in scopes
                               if r["name"] in reachable_parts(nodes, w["name"], scope_names, norm, skip_starts=others)),
            "soldBy": parse_sold_by(w.get("sold_by")),
        })

    armor = []
    for ds, kind in (("helmets", "helmet"), ("vests", "vest"), ("plate_carriers", "carrier")):
        for r in gzw.load(ds):
            armor.append({
                "id": r["id"], "name": r["name"], "kind": kind, "nijClass": _nij(r.get("nij_class")),
                "locations": ["front", "back", "sides"] if kind == "helmet" else parse_locations(r.get("armor_locations")),
                "material": _str(r.get("material")), "soldBy": parse_sold_by(r.get("sold_by")),
            })

    patch = (gzw.patch_info().get("latest_patch") or {}).get("version")
    data = {
        "version": gzw.snapshot_meta().get("data_version"),
        "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "gamePatch": patch,
        "weapons": weapons, "barrels": barrels, "scopes": scopes, "ammo": ammo, "armor": armor,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    _report(data, overridden, barrels_raw)
    return data


def _derive(stopped: str | None) -> list[int] | None:
    if stopped is None:
        return None
    cls = stopped.removeprefix("NIJ ").strip()
    if cls == "0":
        return [0] * 8
    if cls not in NIJ_CLASSES:
        return [2] * 8  # NIJ IV: nothing in the game stops it
    i = NIJ_CLASSES.index(cls)
    return [2] * i + [1] + [0] * (7 - i)


def _report(data: dict, overridden: list[tuple[str, dict]], barrels_raw: list[dict]) -> None:
    disagree = [a["name"] for a in data["ammo"]
                if a["chart"] and _derive(a["stoppedBy"]) and a["chart"] != _derive(a["stoppedBy"])]
    print(f"weapons {len(data['weapons'])}, barrels {len(data['barrels'])}, scopes {len(data['scopes'])}, "
          f"ammo {len(data['ammo'])} ({sum(1 for a in data['ammo'] if a['chart'])} in chart), armor {len(data['armor'])}")
    print(f"chart vs stopped_by disagreements: {len(disagree)}" + (f" → {', '.join(disagree)}" if disagree else ""))
    # The chart's speed and accuracy won over gzw-data for these rounds; a long list after a wiki edit is worth a look.
    for key, what, unit in (("sign", "accuracy sign", " %"), ("acc", "accuracy", " %"), ("mv", "muzzle velocity", " m/s")):
        hits = [f"{name} {n[key][0]:+g}→{n[key][1]:+g}" if unit == " %" else f"{name} {n[key][0]:g}→{n[key][1]:g}"
                for name, n in overridden if key in n]
        if hits:
            print(f"chart overrides gzw-data {what} ({len(hits)}, gzw-data→chart{unit}): {'; '.join(hits)}")
    wiki_mv = [r["name"] for r, b in zip(barrels_raw, data["barrels"])
               if parse_number(r.get("muzzle_velocity")) is None and b["velocityModifierPct"] is not None]
    unknown = [b["name"] for b in data["barrels"] if b["velocityModifierPct"] is None]
    print(f"barrel MV modifiers from the wiki: {len(wiki_mv)} ({', '.join(wiki_mv) or '-'}); "
          f"unknown: {len(unknown)}")


if __name__ == "__main__":
    build()
    sys.exit(0)
