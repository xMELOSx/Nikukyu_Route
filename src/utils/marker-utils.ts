import type { MarkerType, HeistMarker } from './types'
import { MARKER_META } from './constants'

export function isMovementMarker(type: MarkerType): boolean {
  return type === 'warp' || type === 'iwarp' || type === 'stairs' || type === 'start';
}

export function isStopMarker(type: MarkerType): boolean {
  return type === 'picking' || type === 'gpicking' ||
         type === 'long_picking' || type === 'glong_picking' ||
         type === 'boss' || type === 'gbattle' || type === 'battle';
}

export function isCheckpointMarker(type: MarkerType): boolean {
  return type === 'checkpoint';
}

export function getStopDurationSeconds(
  marker: HeistMarker,
  pickyMarkerIds?: { [markerId: string]: boolean }
): number {
  const isPicky = !!(pickyMarkerIds && pickyMarkerIds[marker.id]);
  if (marker.type === 'picking' || marker.type === 'gpicking') {
    if (isPicky) return 0;
    return marker.pickingDurationSeconds ?? 5;
  }
  if (marker.type === 'long_picking' || marker.type === 'glong_picking') {
    if (isPicky) return 0;
    return marker.longPickingDurationSeconds ?? 8;
  }
  if (marker.type === 'boss') {
    return marker.bossDurationSeconds ?? 60;
  }
  if (marker.type === 'battle' || marker.type === 'gbattle') {
    return marker.battleDurationSeconds ?? 20;
  }
  if (marker.type === 'skill_cd') {
    return 0;
  }
  return 0;
}

export function getSkillCdIcon(marker: HeistMarker): string {
  if (marker.skillPresetId) {
    const fromLabel = (marker.skillLabel || '').trim();
    if (fromLabel) return fromLabel.charAt(0);
  }
  const fromNote = (marker.note || '').trim();
  if (fromNote) return fromNote.charAt(0);
  return 'S';
}

export function getSkillCdColor(marker: HeistMarker): string {
  if (marker.skillColor && /^#[0-9a-fA-F]{3,8}$/.test(marker.skillColor)) {
    return marker.skillColor;
  }
  return MARKER_META.skill_cd.color;
}

export function getSkillCdSeconds(marker: HeistMarker): number {
  const mode = marker.skillMode ?? 'fixed';
  if (mode === 'per_second') {
    const use = typeof marker.skillCdSeconds === 'number' && marker.skillCdSeconds > 0 ? marker.skillCdSeconds : 0;
    const rate = typeof marker.skillPerSecondCd === 'number' && marker.skillPerSecondCd > 0 ? marker.skillPerSecondCd : 0;
    if (use <= 0 || rate <= 0) return 0;
    return use * rate;
  }
  if (typeof marker.skillCdSeconds === 'number' && marker.skillCdSeconds > 0) {
    return marker.skillCdSeconds;
  }
  return 0;
}

export function getSkillCdDisplayValue(marker: HeistMarker): number {
  if (typeof marker.skillCdSeconds === 'number' && marker.skillCdSeconds > 0) {
    return marker.skillCdSeconds;
  }
  return 0;
}

export function getSkillCdPerSecondRate(marker: HeistMarker): number {
  if (typeof marker.skillPerSecondCd === 'number' && marker.skillPerSecondCd > 0) {
    return marker.skillPerSecondCd;
  }
  return 0;
}

export function getSkillCdRemaining(marker: HeistMarker, currentElapsed: number, consumedAtElapsed?: number): number {
  const cd = getSkillCdSeconds(marker);
  if (cd <= 0) return 0;
  if (consumedAtElapsed === undefined) return cd;
  return Math.max(0, cd - (currentElapsed - consumedAtElapsed));
}
