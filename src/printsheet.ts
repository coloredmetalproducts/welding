/**
 * An 11x17 plan sheet, drawn as SVG at a true architectural scale.
 *
 * The sheet is authored in hundredths of an inch (100 units = 1"), so a
 * dimension in feet becomes units by multiplying by `inchesPerFoot * 100` and
 * a printed sheet measures correctly under a real architect's rule - provided
 * it is plotted at 100%, which the title block says out loud.
 *
 * Nothing here re-derives building geometry: the footprint, walls, openings,
 * obstructions, ramps, mezzanines and exterior concrete all come off the same
 * BuildingModel the 3D view is built from, so the drawing cannot drift from it.
 */

import * as THREE from 'three';
import type { BuildingModel } from './building';
import { feedFootprint } from './equipment';
import { formatFeet } from './labels';
import type { Rect } from './geometry';
import type { BuildingSpec, Catalog, CatalogItem, PlacedItem } from './types';

export interface PlanSheetOptions {
  spec: BuildingSpec;
  model: BuildingModel;
  catalog: Catalog;
  items: PlacedItem[];
  /** Layout name for the title block. */
  layoutName: string;
  /** Draw the machines, or just the empty building. */
  showEquipment: boolean;
  /** Draw the dock and exterior ramp. Costs scale - they reach 40' out. */
  showExterior: boolean;
  /** Printed on the sheet. Passed in so the sheet itself stays deterministic. */
  dateLabel: string;
}

/** 11x17 landscape, in hundredths of an inch. */
const SHEET_W = 1700;
const SHEET_H = 1100;
const MARGIN = 50;
const TITLE_H = 150;
/** Room outside the building for dimension strings and wall labels. */
const GUTTER = 92;

/** Real architect's scales, largest first. */
const SCALES: Array<{ inchesPerFoot: number; label: string }> = [
  { inchesPerFoot: 1 / 4, label: '1/4" = 1\'-0"' },
  { inchesPerFoot: 3 / 16, label: '3/16" = 1\'-0"' },
  { inchesPerFoot: 1 / 8, label: '1/8" = 1\'-0"' },
  { inchesPerFoot: 3 / 32, label: '3/32" = 1\'-0"' },
  { inchesPerFoot: 1 / 16, label: '1/16" = 1\'-0"' },
  { inchesPerFoot: 1 / 32, label: '1/32" = 1\'-0"' },
];

const INK = '#12181d';
const RULE = '#4a5560';
const FAINT = '#aab3bb';
const GRID_MINOR = '#ccd4da';
const GRID_MAJOR = '#a4aeb6';
const ENVELOPE = '#4f8a70';

function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);
}

/** Feet as a plain drawing annotation: 12'-6", and 24'-0" rather than 24'. */
function dim(feet: number): string {
  return formatFeet(feet);
}

interface Sheet {
  /** World feet to sheet units. */
  sx(x: number): number;
  sy(z: number): number;
  /** Length in feet to length in sheet units. */
  len(feet: number): number;
  scaleLabel: string;
  inchesPerFoot: number;
}

function rectPoints(r: Rect): Array<[number, number]> {
  return [
    [r.x0, r.z0],
    [r.x1, r.z0],
    [r.x1, r.z1],
    [r.x0, r.z1],
  ];
}

/** Footprint corners of a placed machine, in world feet. */
function itemCorners(
  catalog: CatalogItem,
  placed: PlacedItem,
  padStart = 0,
  padEnd = 0,
): Array<[number, number]> {
  const feed = feedFootprint(catalog);
  const x0 = -feed.along / 2 - padStart;
  const x1 = feed.along / 2 + padEnd;
  const half = feed.across / 2;
  const yaw = THREE.MathUtils.degToRad(placed.rotation);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  // Same convention as the 3D placement: yaw about Y, so local +X maps to
  // (cos, -sin) in world (x, z).
  return ([
    [x0, -half],
    [x1, -half],
    [x1, half],
    [x0, half],
  ] as Array<[number, number]>).map(([u, v]) => [
    placed.x + u * cos + v * sin,
    placed.z - u * sin + v * cos,
  ]);
}

export interface PlanSheet {
  svg: string;
  scaleLabel: string;
}

export function buildPlanSheet(options: PlanSheetOptions): PlanSheet {
  const { spec, model, catalog, items, showEquipment, showExterior } = options;
  const placed = showEquipment
    ? items
        .map((item) => ({
          item,
          def: catalog.items.find((entry) => entry.id === item.catalogId),
        }))
        .filter((row): row is { item: PlacedItem; def: CatalogItem } => Boolean(row.def))
    : [];

  // ------------------------------------------------------------ extents
  let minX = 0;
  let maxX = spec.length;
  let minZ = 0;
  let maxZ = spec.width;
  if (showExterior) {
    for (const work of model.exteriorFootprints) {
      minX = Math.min(minX, work.rect.x0);
      maxX = Math.max(maxX, work.rect.x1);
      minZ = Math.min(minZ, work.rect.z0);
      maxZ = Math.max(maxZ, work.rect.z1);
    }
  }
  // Clearance envelopes are part of the drawing, so they get to set the extent.
  for (const { item, def } of placed) {
    if (!def.clearance) continue;
    const reachIn = def.clearance.infeed ?? def.clearance.eachEnd ?? 0;
    const reachOut = def.clearance.outfeed ?? def.clearance.eachEnd ?? 0;
    for (const [x, z] of itemCorners(def, item, reachIn, reachOut)) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }

  const drawW = SHEET_W - MARGIN * 2;
  const drawH = SHEET_H - MARGIN * 2 - TITLE_H;
  const extentX = maxX - minX;
  const extentZ = maxZ - minZ;
  const chosen =
    SCALES.find(
      (s) =>
        extentX * s.inchesPerFoot * 100 + GUTTER * 2 <= drawW &&
        extentZ * s.inchesPerFoot * 100 + GUTTER * 2 <= drawH,
    ) ?? SCALES[SCALES.length - 1];
  const unitsPerFoot = chosen.inchesPerFoot * 100;

  // Centre the drawing in the area above the title block.
  const originX = MARGIN + (drawW - extentX * unitsPerFoot) / 2 - minX * unitsPerFoot;
  const originY = MARGIN + (drawH - extentZ * unitsPerFoot) / 2 - minZ * unitsPerFoot;
  const sheet: Sheet = {
    sx: (x) => originX + x * unitsPerFoot,
    sy: (z) => originY + z * unitsPerFoot,
    len: (feet) => feet * unitsPerFoot,
    scaleLabel: chosen.label,
    inchesPerFoot: chosen.inchesPerFoot,
  };

  const out: string[] = [];
  const poly = (pts: Array<[number, number]>) =>
    pts.map(([x, z]) => `${sheet.sx(x).toFixed(2)},${sheet.sy(z).toFixed(2)}`).join(' ');

  // ------------------------------------------------------------- defs
  out.push(`<defs>
    <clipPath id="slab"><polygon points="${poly(
      model.footprint.points.map((p) => [p.x, p.y] as [number, number]),
    )}" /></clipPath>
    <pattern id="hatch" width="9" height="9" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="9" stroke="${RULE}" stroke-width="1.2" />
    </pattern>
    <pattern id="conc" width="14" height="14" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="14" stroke="${FAINT}" stroke-width="1" />
    </pattern>
  </defs>`);

  // -------------------------------------------------- exterior concrete
  if (showExterior) {
    for (const work of model.exteriorFootprints) {
      out.push(
        `<polygon points="${poly(rectPoints(work.rect))}" fill="url(#conc)" stroke="${FAINT}" stroke-width="1.5" />`,
      );
      const cx = (work.rect.x0 + work.rect.x1) / 2;
      const cz = (work.rect.z0 + work.rect.z1) / 2;
      out.push(
        `<text x="${sheet.sx(cx).toFixed(1)}" y="${sheet.sy(cz).toFixed(1)}" class="lbl" text-anchor="middle">${esc(
          work.label.toUpperCase(),
        )}</text>`,
      );
    }
  }

  // ------------------------------------------------------------- floor
  out.push(
    `<polygon points="${poly(
      model.footprint.points.map((p) => [p.x, p.y] as [number, number]),
    )}" fill="#ffffff" />`,
  );

  // 5' grid, heavier every 25', clipped to the slab so it stops at the cutout.
  const grid: string[] = [];
  for (let x = 0; x <= spec.length + 0.001; x += 5) {
    const major = Math.abs(x % 25) < 0.001;
    grid.push(
      `<line x1="${sheet.sx(x).toFixed(1)}" y1="${sheet.sy(0).toFixed(1)}" x2="${sheet
        .sx(x)
        .toFixed(1)}" y2="${sheet.sy(spec.width).toFixed(1)}" stroke="${
        major ? GRID_MAJOR : GRID_MINOR
      }" stroke-width="${major ? 1 : 0.5}" />`,
    );
  }
  for (let z = 0; z <= spec.width + 0.001; z += 5) {
    const major = Math.abs(z % 25) < 0.001;
    grid.push(
      `<line x1="${sheet.sx(0).toFixed(1)}" y1="${sheet.sy(z).toFixed(1)}" x2="${sheet
        .sx(spec.length)
        .toFixed(1)}" y2="${sheet.sy(z).toFixed(1)}" stroke="${
        major ? GRID_MAJOR : GRID_MINOR
      }" stroke-width="${major ? 1 : 0.5}" />`,
    );
  }
  out.push(`<g clip-path="url(#slab)">${grid.join('')}</g>`);

  // ----------------------------------------------------- mezzanine over
  // Clipped to the slab: the deck wraps the corner cutout, so its outline has
  // to stop there rather than run out over ground that isn't the building.
  const mezzOutlines = model.mezzanineFootprints
    .map(
      (rect) =>
        `<polygon points="${poly(rectPoints(rect))}" fill="none" stroke="${RULE}" stroke-width="2" stroke-dasharray="10 7" />`,
    )
    .join('');
  out.push(`<g clip-path="url(#slab)">${mezzOutlines}</g>`);
  const mezz = (spec.mezzanines ?? [])[0];
  const mezzRect = model.mezzanineFootprints[0];
  if (mezz && mezzRect) {
    // The note lives in the blank corner cutout, on a leader back to the deck.
    const noteX = (mezzRect.x0 + mezzRect.x1) / 2 + 2;
    const noteZ = mezzRect.z1 - 6;
    const anchorX = mezzRect.x0 + 5;
    const anchorZ = mezzRect.z1 - 13;
    out.push(
      `<line x1="${sheet.sx(anchorX).toFixed(1)}" y1="${sheet.sy(anchorZ).toFixed(1)}" x2="${sheet
        .sx(noteX)
        .toFixed(1)}" y2="${sheet.sy(noteZ - 2).toFixed(1)}" stroke="${FAINT}" stroke-width="1" />`,
      `<text x="${sheet.sx(noteX).toFixed(1)}" y="${sheet.sy(noteZ).toFixed(1)}" class="lbl" text-anchor="middle">${esc(
        mezz.label.toUpperCase(),
      )} OVER</text>`,
      `<text x="${sheet.sx(noteX).toFixed(1)}" y="${(sheet.sy(noteZ) + 13).toFixed(
        1,
      )}" class="lbl" text-anchor="middle">${esc(dim(mezz.clearHeight))} CLEAR</text>`,
    );
  }

  // ------------------------------------------------------------- ramps
  for (const rect of model.rampFootprints) {
    out.push(
      `<polygon points="${poly(rectPoints(rect))}" fill="none" stroke="${RULE}" stroke-width="2" />`,
    );
  }
  for (const ramp of spec.ramps ?? []) {
    const rect = model.rampFootprints[0];
    if (!rect) break;
    // Treads across the run, and an arrow pointing up the slope.
    const steps = 6;
    for (let i = 1; i < steps; i += 1) {
      const x = rect.x0 + ((rect.x1 - rect.x0) * i) / steps;
      out.push(
        `<line x1="${sheet.sx(x).toFixed(1)}" y1="${sheet.sy(rect.z0).toFixed(1)}" x2="${sheet
          .sx(x)
          .toFixed(1)}" y2="${sheet.sy(rect.z1).toFixed(1)}" stroke="${FAINT}" stroke-width="1" />`,
      );
    }
    out.push(
      `<text x="${sheet.sx((rect.x0 + rect.x1) / 2).toFixed(1)}" y="${sheet
        .sy(rect.z1 - 1.2)
        .toFixed(1)}" class="lbl" text-anchor="middle">RAMP UP ${esc(dim(ramp.rise))}</text>`,
    );
    break;
  }

  // ----------------------------------------------- unusable floor areas
  for (const rect of model.blockedFootprints) {
    out.push(
      `<polygon points="${poly(rectPoints(rect))}" fill="url(#hatch)" stroke="${INK}" stroke-width="2" />`,
    );
  }
  for (const obstruction of spec.obstructions ?? []) {
    const rect = model.blockedFootprints[0];
    if (!rect) break;
    const cx = sheet.sx((rect.x0 + rect.x1) / 2);
    const cz = sheet.sy((rect.z0 + rect.z1) / 2);
    out.push(
      `<text x="${cx.toFixed(1)}" y="${cz.toFixed(
        1,
      )}" class="lbl" text-anchor="middle" transform="rotate(-90 ${cx.toFixed(1)} ${cz.toFixed(
        1,
      )})">${esc(obstruction.label.toUpperCase())}</text>`,
    );
    break;
  }

  // ------------------------------------------------------------- walls
  // Each perimeter edge is drawn as a heavy line, broken at its openings.
  const wallLines: string[] = [];
  const symbols: string[] = [];
  for (const frame of model.walls) {
    const openings = model.openings.filter((op) => op.wall === frame.id);
    const cuts = openings
      .map((op) => [op.uStart, op.uEnd] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const world = (u: number): [number, number] => {
      const p = new THREE.Vector3(u, 0, 0).applyMatrix4(frame.matrix);
      return [p.x, p.z];
    };
    let cursor = 0;
    for (const [start, end] of cuts) {
      if (start > cursor) {
        const a = world(cursor);
        const b = world(start);
        wallLines.push(
          `<line x1="${sheet.sx(a[0]).toFixed(1)}" y1="${sheet.sy(a[1]).toFixed(1)}" x2="${sheet
            .sx(b[0])
            .toFixed(1)}" y2="${sheet.sy(b[1]).toFixed(1)}" />`,
        );
      }
      cursor = Math.max(cursor, end);
    }
    if (cursor < frame.span) {
      const a = world(cursor);
      const b = world(frame.span);
      wallLines.push(
        `<line x1="${sheet.sx(a[0]).toFixed(1)}" y1="${sheet.sy(a[1]).toFixed(1)}" x2="${sheet
          .sx(b[0])
          .toFixed(1)}" y2="${sheet.sy(b[1]).toFixed(1)}" />`,
      );
    }

    // Opening symbols: a threshold across the gap, plus swing arcs on hinged
    // leaves, drawn on the inside face.
    const inward = new THREE.Vector3().setFromMatrixColumn(frame.matrix, 2).normalize();
    for (const op of openings) {
      const a = world(op.uStart);
      const b = world(op.uEnd);
      symbols.push(
        `<line x1="${sheet.sx(a[0]).toFixed(1)}" y1="${sheet.sy(a[1]).toFixed(1)}" x2="${sheet
          .sx(b[0])
          .toFixed(1)}" y2="${sheet.sy(b[1]).toFixed(1)}" stroke="${RULE}" stroke-width="1.5" />`,
      );
      if (op.kind === 'man-double' || op.kind === 'man-single') {
        const leaf = op.leafWidth ?? op.width / (op.kind === 'man-double' ? 2 : 1);
        const hinges =
          op.kind === 'man-double' ? [op.uStart, op.uEnd] : [op.uStart];
        for (const [index, u] of hinges.entries()) {
          const pivot = world(u);
          const towards = index === 0 ? 1 : -1;
          const tip = world(u + towards * leaf);
          const swept: [number, number] = [
            pivot[0] + inward.x * leaf,
            pivot[1] + inward.z * leaf,
          ];
          symbols.push(
            `<path d="M ${sheet.sx(tip[0]).toFixed(1)} ${sheet.sy(tip[1]).toFixed(1)} A ${sheet
              .len(leaf)
              .toFixed(1)} ${sheet.len(leaf).toFixed(1)} 0 0 ${
              towards > 0 ? 1 : 0
            } ${sheet.sx(swept[0]).toFixed(1)} ${sheet.sy(swept[1]).toFixed(1)}" fill="none" stroke="${FAINT}" stroke-width="1" />`,
            `<line x1="${sheet.sx(pivot[0]).toFixed(1)}" y1="${sheet
              .sy(pivot[1])
              .toFixed(1)}" x2="${sheet.sx(swept[0]).toFixed(1)}" y2="${sheet
              .sy(swept[1])
              .toFixed(1)}" stroke="${RULE}" stroke-width="1.5" />`,
          );
        }
      }
      // Call-out just inside the opening.
      const mid: [number, number] = [
        (a[0] + b[0]) / 2 + inward.x * 5,
        (a[1] + b[1]) / 2 + inward.z * 5,
      ];
      symbols.push(
        `<text x="${sheet.sx(mid[0]).toFixed(1)}" y="${sheet.sy(mid[1]).toFixed(1)}" class="lbl" text-anchor="middle">${esc(
          `${dim(op.width)} x ${dim(op.height)}`,
        )}</text>`,
      );
    }
  }
  out.push(
    `<g stroke="${INK}" stroke-width="4.5" stroke-linecap="square">${wallLines.join('')}</g>`,
    symbols.join(''),
  );

  // --------------------------------------------------------- equipment
  const schedule: Array<{ tag: number; label: string; size: string }> = [];
  placed.forEach(({ item, def }, index) => {
    const tag = index + 1;
    if (def.clearance) {
      const reachIn = def.clearance.infeed ?? def.clearance.eachEnd ?? 0;
      const reachOut = def.clearance.outfeed ?? def.clearance.eachEnd ?? 0;
      out.push(
        `<polygon points="${poly(
          itemCorners(def, item, reachIn, reachOut),
        )}" fill="none" stroke="${ENVELOPE}" stroke-width="1.2" stroke-dasharray="8 5" />`,
      );
    }
    out.push(
      `<polygon points="${poly(itemCorners(def, item))}" fill="#e4eaee" stroke="${INK}" stroke-width="2" />`,
    );
    const r = 9;
    out.push(
      `<circle cx="${sheet.sx(item.x).toFixed(1)}" cy="${sheet
        .sy(item.z)
        .toFixed(1)}" r="${r}" fill="#ffffff" stroke="${INK}" stroke-width="1.5" />`,
      `<text x="${sheet.sx(item.x).toFixed(1)}" y="${(sheet.sy(item.z) + 4).toFixed(
        1,
      )}" class="tag" text-anchor="middle">${tag}</text>`,
    );
    schedule.push({
      tag,
      label: def.label.replace(/\s*\([^)]*\)/g, ''),
      size: `${dim(def.width)} x ${dim(def.length)}`,
    });
  });

  // -------------------------------------------------------- dimensions
  const dimLine = (
    from: [number, number],
    to: [number, number],
    text: string,
    axis: 'h' | 'v',
  ): string => {
    const x1 = sheet.sx(from[0]);
    const y1 = sheet.sy(from[1]);
    const x2 = sheet.sx(to[0]);
    const y2 = sheet.sy(to[1]);
    const tick = 5;
    const label =
      axis === 'h'
        ? `<text x="${((x1 + x2) / 2).toFixed(1)}" y="${(y1 - 6).toFixed(
            1,
          )}" class="dim" text-anchor="middle">${esc(text)}</text>`
        : `<text x="${(x1 - 6).toFixed(1)}" y="${((y1 + y2) / 2).toFixed(
            1,
          )}" class="dim" text-anchor="middle" transform="rotate(-90 ${(x1 - 6).toFixed(
            1,
          )} ${((y1 + y2) / 2).toFixed(1)})">${esc(text)}</text>`;
    return (
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(
        1,
      )}" stroke="${RULE}" stroke-width="0.8" />` +
      (axis === 'h'
        ? `<line x1="${x1.toFixed(1)}" y1="${(y1 - tick).toFixed(1)}" x2="${x1.toFixed(
            1,
          )}" y2="${(y1 + tick).toFixed(1)}" stroke="${RULE}" stroke-width="0.8" />` +
          `<line x1="${x2.toFixed(1)}" y1="${(y2 - tick).toFixed(1)}" x2="${x2.toFixed(
            1,
          )}" y2="${(y2 + tick).toFixed(1)}" stroke="${RULE}" stroke-width="0.8" />`
        : `<line x1="${(x1 - tick).toFixed(1)}" y1="${y1.toFixed(1)}" x2="${(x1 + tick).toFixed(
            1,
          )}" y2="${y1.toFixed(1)}" stroke="${RULE}" stroke-width="0.8" />` +
          `<line x1="${(x2 - tick).toFixed(1)}" y1="${y2.toFixed(1)}" x2="${(x2 + tick).toFixed(
            1,
          )}" y2="${y2.toFixed(1)}" stroke="${RULE}" stroke-width="0.8" />`) +
      label
    );
  };

  // Front wall opening string, above the building; overalls below and left.
  const frontStops = new Set<number>([0, spec.length]);
  for (const op of model.openings.filter((o) => o.wall === 'front')) {
    frontStops.add(op.uStart);
    frontStops.add(op.uEnd);
  }
  const stops = [...frontStops].sort((a, b) => a - b);
  const stringZ = minZ - 26 / unitsPerFoot;
  for (let i = 0; i < stops.length - 1; i += 1) {
    out.push(
      dimLine([stops[i], stringZ], [stops[i + 1], stringZ], dim(stops[i + 1] - stops[i]), 'h'),
    );
  }
  const overallZ = maxZ + 46 / unitsPerFoot;
  out.push(dimLine([0, overallZ], [spec.length, overallZ], dim(spec.length), 'h'));
  const overallX = minX - 34 / unitsPerFoot;
  out.push(dimLine([overallX, 0], [overallX, spec.width], dim(spec.width), 'v'));

  // ------------------------------------------------------ wall labels
  const wallLabel = (text: string, x: number, z: number, rotate = 0) =>
    `<text x="${sheet.sx(x).toFixed(1)}" y="${sheet.sy(z).toFixed(1)}" class="wall" text-anchor="middle"${
      rotate ? ` transform="rotate(${rotate} ${sheet.sx(x).toFixed(1)} ${sheet.sy(z).toFixed(1)})"` : ''
    }>${esc(text)}</text>`;
  out.push(
    wallLabel('FRONT WALL', spec.length / 2, minZ - 52 / unitsPerFoot),
    wallLabel('REAR WALL', spec.length / 2, maxZ + 70 / unitsPerFoot),
    wallLabel('RIGHT END', minX - 62 / unitsPerFoot, spec.width / 2, -90),
    wallLabel('LEFT END', maxX + 30 / unitsPerFoot, spec.width / 2, -90),
  );

  // ------------------------------------------------------- title block
  const tx = MARGIN;
  const ty = SHEET_H - MARGIN - TITLE_H;
  const tw = SHEET_W - MARGIN * 2;
  const title: string[] = [
    `<rect x="${tx}" y="${ty}" width="${tw}" height="${TITLE_H}" fill="none" stroke="${INK}" stroke-width="2.5" />`,
    `<line x1="${tx + 430}" y1="${ty}" x2="${tx + 430}" y2="${ty + TITLE_H}" stroke="${INK}" stroke-width="1.5" />`,
    `<line x1="${tx + 1100}" y1="${ty}" x2="${tx + 1100}" y2="${
      ty + TITLE_H
    }" stroke="${INK}" stroke-width="1.5" />`,
    `<text x="${tx + 18}" y="${ty + 34}" class="t1">WELDING SHOP &#8212; FLOOR PLAN</text>`,
    `<text x="${tx + 18}" y="${ty + 60}" class="t2">${esc(options.layoutName.toUpperCase())}${
      showEquipment ? '' : ' &#8212; BASE BUILDING ONLY'
    }</text>`,
    `<text x="${tx + 18}" y="${ty + 86}" class="t3">${esc(
      dim(spec.length),
    )} x ${esc(dim(spec.width))} ENVELOPE &#183; ${Math.round(
      model.footprint.area,
    ).toLocaleString()} SQ FT FLOOR</text>`,
    `<text x="${tx + 18}" y="${ty + 108}" class="t3">${esc(
      dim(spec.eaveHeight),
    )} EAVE / ${esc(dim(spec.ridgeHeight))} RIDGE &#183; NO INTERIOR COLUMNS</text>`,
    `<text x="${tx + 18}" y="${ty + 132}" class="t3">${esc(options.dateLabel)}</text>`,
  ];

  // Equipment schedule, two columns.
  if (schedule.length > 0) {
    title.push(`<text x="${tx + 448}" y="${ty + 24}" class="t4">EQUIPMENT</text>`);
    const rows = Math.ceil(schedule.length / 2);
    schedule.forEach((row, index) => {
      const col = Math.floor(index / rows);
      const line = index % rows;
      const x = tx + 448 + col * 332;
      const y = ty + 48 + line * 24;
      title.push(
        `<circle cx="${x + 7}" cy="${y - 4}" r="8" fill="none" stroke="${INK}" stroke-width="1.2" />`,
        `<text x="${x + 7}" y="${y}" class="tag" text-anchor="middle">${row.tag}</text>`,
        `<text x="${x + 22}" y="${y}" class="t5">${esc(row.label)} &#183; ${esc(row.size)}</text>`,
      );
    });
  } else {
    title.push(
      `<text x="${tx + 448}" y="${ty + 24}" class="t4">EQUIPMENT</text>`,
      `<text x="${tx + 448}" y="${ty + 48}" class="t5">Not shown &#8212; base building only.</text>`,
    );
  }

  // Scale block: the words, and a graphic bar that stays true under any zoom.
  const sxRight = tx + 1118;
  title.push(
    `<text x="${sxRight}" y="${ty + 24}" class="t4">SCALE</text>`,
    `<text x="${sxRight}" y="${ty + 54}" class="t1">${esc(chosen.label)}</text>`,
  );
  const barFeet = 30;
  const seg = sheet.len(10);
  const barY = ty + 84;
  for (let i = 0; i < barFeet / 10; i += 1) {
    title.push(
      `<rect x="${(sxRight + i * seg).toFixed(1)}" y="${barY}" width="${seg.toFixed(
        1,
      )}" height="11" fill="${i % 2 === 0 ? INK : '#ffffff'}" stroke="${INK}" stroke-width="1" />`,
    );
  }
  for (let i = 0; i <= barFeet / 10; i += 1) {
    title.push(
      `<text x="${(sxRight + i * seg).toFixed(1)}" y="${barY + 26}" class="t5" text-anchor="middle">${
        i * 10
      }</text>`,
    );
  }
  title.push(
    `<text x="${(sxRight + (barFeet / 10) * seg + 14).toFixed(1)}" y="${barY + 26}" class="t5">FEET</text>`,
    `<text x="${sxRight}" y="${ty + 128}" class="t5">PLOT AT 100% ON 11x17 TABLOID, LANDSCAPE.</text>`,
    `<text x="${sxRight}" y="${ty + 144}" class="t5">GRID IS 5 FT, HEAVY LINES 25 FT.</text>`,
  );
  out.push(title.join(''));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="17in" height="11in" viewBox="0 0 ${SHEET_W} ${SHEET_H}">
  <style>
    text { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; fill: ${INK}; }
    .lbl { font-size: 10px; letter-spacing: 0.5px; fill: ${RULE}; }
    .dim { font-size: 11px; fill: ${RULE}; }
    .wall { font-size: 13px; letter-spacing: 2px; fill: ${RULE}; font-weight: 700; }
    .tag { font-size: 11px; font-weight: 700; }
    .t1 { font-size: 21px; font-weight: 700; letter-spacing: 0.5px; }
    .t2 { font-size: 15px; font-weight: 600; letter-spacing: 0.5px; }
    .t3 { font-size: 12px; fill: ${RULE}; }
    .t4 { font-size: 11px; font-weight: 700; letter-spacing: 2px; fill: ${RULE}; }
    .t5 { font-size: 12px; fill: ${RULE}; }
  </style>
  <rect width="${SHEET_W}" height="${SHEET_H}" fill="#ffffff" />
  ${out.join('\n  ')}
</svg>`;

  return { svg, scaleLabel: chosen.label };
}
